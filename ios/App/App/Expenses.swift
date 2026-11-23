import Foundation
import AppIntents
import Capacitor

// Przechwytywanie płatności w tle: automatyzacja „Transakcja” w Skrótach uruchamia `AddExpenseIntent`
// (bez otwierania aplikacji), intencja dopisuje rekord do kolejki w pliku JSON, a strona po otwarciu
// pobiera kolejkę przez wtyczkę `PendingExpenses` i usuwa rekordy dopiero po zapisie w IndexedDB.

// MARK: - App Intent

struct AddExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Dodaj wydatek"
    static let description = IntentDescription("Zapisuje płatność w Dzienniku bez otwierania aplikacji.")
    static let openAppWhenRun: Bool = false

    // Kwota jako tekst, nie `IntentCurrencyAmount`: Skróty nie zawsze potrafią zamienić zmienną „Kwota”
    // z automatyzacji Portfela na kwotę z walutą i przekazują wtedy pusty parametr (płatność przepadała
    // z błędem „Brak kwoty”). Na tekst da się zamienić każdą zmienną, a format („12,99 zł”, „PLN 12.99”,
    // „€5.00”) rozbiera `CapturedAmount.parse`.
    // Opcjonalna: odczyt pustego wymaganego parametru w `perform()` kończy się fatalError i crashem w tle
    // („Couldn't communicate with a helper application.”).
    @Parameter(title: "Kwota")
    var amount: String?

    // Opcjonalny: wymagany parametr bez wartości z automatyzacji kazałby Skrótom pytać przy kasie.
    @Parameter(title: "Sklep")
    var merchant: String?

    @Parameter(title: "Karta")
    var card: String?

    func perform() async throws -> some IntentResult {
        let raw = (amount ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw AddExpenseError.missingAmount }
        guard let parsed = CapturedAmount.parse(raw) else { throw AddExpenseError.unreadableAmount(raw) }
        try PendingQueue.append([
            "id": UUID().uuidString,
            "capturedAt": Int64((Date().timeIntervalSince1970 * 1000).rounded()),
            "amount": parsed.value,
            "currency": parsed.currency,
            "merchant": merchant ?? "",
            "card": card ?? "",
        ])
        return .result()
    }
}

enum AddExpenseError: Error, CustomLocalizedStringResourceConvertible {
    case missingAmount
    case unreadableAmount(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .missingAmount:
            return "Brak kwoty płatności. Automatyzację sprawdzisz prawdziwą płatnością — przycisk ▶︎ w Skrótach nie podaje kwoty."
        case .unreadableAmount(let raw):
            return "Nie umiem odczytać kwoty „\(raw)”."
        }
    }
}

/// Kwota z tekstu, który Skróty robią ze zmiennej „Kwota”: „12,99 zł”, „1 234,56 PLN”, „PLN 12.99”, „€5.00”, „12.99”.
enum CapturedAmount {
    private static let symbols: [(String, String)] = [("zł", "PLN"), ("€", "EUR"), ("$", "USD"), ("£", "GBP")]

    static func parse(_ text: String) -> (value: Double, currency: String)? {
        let upper = text.uppercased()
        var currency = "PLN"
        if let code = upper.range(of: "[A-Z]{3}", options: .regularExpression) {
            currency = String(upper[code])
        } else if let hit = symbols.first(where: { text.lowercased().contains($0.0) }) {
            currency = hit.1
        }
        // Zostają cyfry i separatory; spacje (także twarde) to separatory tysięcy.
        var number = String(text.filter { $0.isASCII && ($0.isNumber || $0 == "," || $0 == ".") })
        let commas = number.filter { $0 == "," }.count
        let dots = number.filter { $0 == "." }.count
        if commas > 0 && dots > 0 {
            // Oba separatory: ostatni jest dziesiętny, drugi to tysiące.
            let decimal: Character = number.lastIndex(of: ",")! > number.lastIndex(of: ".")! ? "," : "."
            number = String(number.filter { $0 != (decimal == "," ? "." : ",") })
            number = number.replacingOccurrences(of: ",", with: ".")
        } else if commas > 0 || dots > 0 {
            let sep: Character = commas > 0 ? "," : "."
            let parts = number.split(separator: sep, omittingEmptySubsequences: false)
            // Jeden separator z 1–2 cyframi po nim = część dziesiętna („12,99”); inaczej tysiące („1.234”).
            if parts.count == 2 && (1...2).contains(parts[1].count) {
                number = parts.joined(separator: ".")
            } else {
                number = parts.joined()
            }
        }
        guard let value = Double(number), value.isFinite, value > 0 else { return nil }
        return ((value * 100).rounded() / 100, currency)
    }
}

struct DziennikShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddExpenseIntent(), phrases: ["Dodaj wydatek w \(.applicationName)"])
    }
}

// MARK: - Kolejka

/// Kolejka płatności w `Application Support/pending-expenses.json`. Intencja i wtyczka działają w tym samym
/// procesie aplikacji, więc wystarcza blokada w pamięci; zapis atomowy chroni plik przed przerwaniem.
enum PendingQueue {
    private static let lock = NSLock()

    private static var fileURL: URL {
        get throws {
            let dir = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: true)
            return dir.appendingPathComponent("pending-expenses.json")
        }
    }

    static func append(_ record: [String: Any]) throws {
        lock.lock()
        defer { lock.unlock() }
        var items = try read()
        items.append(record)
        try write(items)
    }

    static func all() throws -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return try read()
    }

    static func remove(ids: [String]) throws {
        lock.lock()
        defer { lock.unlock() }
        let drop = Set(ids)
        let items = try read()
        let kept = items.filter { !drop.contains($0["id"] as? String ?? "") }
        if kept.count != items.count { try write(kept) }
    }

    /// Brak pliku = pusta kolejka. Każdy inny błąd odczytu jest rzucany dalej, żeby wywołujący nie nadpisał
    /// pliku, którego tylko chwilowo nie da się przeczytać (np. klucze ochrony danych niedostępne).
    private static func read() throws -> [[String: Any]] {
        let url = try fileURL
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return []
        } catch let error as NSError where error.domain == NSPOSIXErrorDomain && error.code == Int(ENOENT) {
            return []
        }
        if data.isEmpty { return [] }
        if let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            return items
        }
        // Uszkodzony plik odkładamy obok; jeśli się nie da, rzucamy — wtedy nic go nie nadpisze.
        let aside = url.deletingLastPathComponent()
            .appendingPathComponent("pending-expenses.corrupt-\(Int64(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString).json")
        try FileManager.default.moveItem(at: url, to: aside)
        return []
    }

    private static func write(_ items: [[String: Any]]) throws {
        let data = try JSONSerialization.data(withJSONObject: items)
        // Dostępny po pierwszym odblokowaniu od restartu — płatność bywa przy zablokowanym ekranie.
        try data.write(to: try fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

// MARK: - Wtyczka Capacitor

@objc(PendingExpensesPlugin)
class PendingExpensesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PendingExpensesPlugin"
    let jsName = "PendingExpenses"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "expiry", returnType: CAPPluginReturnPromise),
    ]

    @objc func list(_ call: CAPPluginCall) {
        do {
            guard let items = JSTypes.coerceArrayToJSArray(try PendingQueue.all()) else {
                call.reject("Nie udało się odczytać kolejki")
                return
            }
            call.resolve(["items": items])
        } catch {
            call.reject("Nie udało się odczytać kolejki", nil, error)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self) else {
            call.reject("Brak listy ids")
            return
        }
        do {
            try PendingQueue.remove(ids: ids)
            call.resolve()
        } catch {
            call.reject("Nie udało się zaktualizować kolejki", nil, error)
        }
    }

    /// Data wygaśnięcia profilu instalacyjnego w ms; `null`, gdy brak `embedded.mobileprovision` (symulator).
    @objc func expiry(_ call: CAPPluginCall) {
        if let date = Self.provisioningExpiry() {
            call.resolve(["expiresAt": Int64((date.timeIntervalSince1970 * 1000).rounded())])
        } else {
            call.resolve(["expiresAt": NSNull()])
        }
    }

    private static func provisioningExpiry() -> Date? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let blob = try? Data(contentsOf: url),
              let start = blob.range(of: Data("<?xml".utf8)),
              let end = blob.range(of: Data("</plist>".utf8), in: start.lowerBound..<blob.endIndex)
        else { return nil }
        // Profil to podpisany kontener CMS z osadzonym plistem XML — wycinamy sam plist.
        let plistData = blob.subdata(in: start.lowerBound..<end.upperBound)
        guard let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any]
        else { return nil }
        return plist["ExpirationDate"] as? Date
    }
}
