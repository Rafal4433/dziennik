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

    @Parameter(title: "Kwota")
    var amount: IntentCurrencyAmount

    @Parameter(title: "Sklep")
    var merchant: String

    @Parameter(title: "Karta")
    var card: String?

    func perform() async throws -> some IntentResult {
        try PendingQueue.append([
            "id": UUID().uuidString,
            "capturedAt": Int64((Date().timeIntervalSince1970 * 1000).rounded()),
            "amount": NSDecimalNumber(decimal: amount.amount).doubleValue,
            "currency": amount.currencyCode.uppercased(),
            "merchant": merchant,
            "card": card ?? "",
        ])
        return .result()
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

    static func all() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return (try? read()) ?? []
    }

    static func remove(ids: [String]) throws {
        lock.lock()
        defer { lock.unlock() }
        let drop = Set(ids)
        let items = try read()
        let kept = items.filter { !drop.contains($0["id"] as? String ?? "") }
        if kept.count != items.count { try write(kept) }
    }

    private static func read() throws -> [[String: Any]] {
        let url = try fileURL
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return [] }
        if let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            return items
        }
        // Uszkodzony plik odkładamy obok zamiast go nadpisywać — żaden zapis nie ginie po cichu.
        let aside = url.deletingLastPathComponent()
            .appendingPathComponent("pending-expenses.corrupt-\(Int(Date().timeIntervalSince1970)).json")
        try? FileManager.default.moveItem(at: url, to: aside)
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
        let items = JSTypes.coerceArrayToJSArray(PendingQueue.all()) ?? []
        call.resolve(["items": items])
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
