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

    // Opcjonalna: odczyt pustego wymaganego parametru w `perform()` kończy się fatalError, a proces aplikacji
    // pada w tle. Skróty pokazują wtedy tylko „Couldn't communicate with a helper application.” — tak jest
    // np. przy uruchomieniu automatyzacji „Transakcja” przyciskiem ▶︎ (bez płatności zmienna „Kwota” jest pusta)
    // albo gdy Portfel nie poda kwoty. Brak kwoty obsługujemy jako zwykły, czytelny błąd.
    @Parameter(title: "Kwota")
    var amount: IntentCurrencyAmount?

    // Opcjonalny: wymagany parametr bez wartości z automatyzacji kazałby Skrótom pytać przy kasie.
    @Parameter(title: "Sklep")
    var merchant: String?

    @Parameter(title: "Karta")
    var card: String?

    func perform() async throws -> some IntentResult {
        guard let amount else { throw AddExpenseError.missingAmount }
        let value = NSDecimalNumber(decimal: amount.amount).doubleValue
        // NaN/∞ wywróciłyby JSONSerialization (wyjątek Obj-C, którego `try` nie łapie) — znów crash w tle.
        guard value.isFinite else { throw AddExpenseError.missingAmount }
        let currency = amount.currencyCode.trimmingCharacters(in: .whitespaces).uppercased()
        try PendingQueue.append([
            "id": UUID().uuidString,
            "capturedAt": Int64((Date().timeIntervalSince1970 * 1000).rounded()),
            "amount": value,
            "currency": currency.isEmpty ? "PLN" : currency,
            "merchant": merchant ?? "",
            "card": card ?? "",
        ])
        return .result()
    }
}

enum AddExpenseError: Error, CustomLocalizedStringResourceConvertible {
    case missingAmount

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .missingAmount:
            return "Brak kwoty płatności. Automatyzację sprawdzisz prawdziwą płatnością — przycisk ▶︎ w Skrótach nie podaje kwoty."
        }
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
