import Foundation
import Speech
import AVFoundation
import Capacitor

// Rozpoznawanie mowy po polsku dla asystenta (SFSpeechRecognizer). Strona wywołuje `start`,
// dostaje zdarzenia `partial` z bieżącym tekstem, a po chwili ciszy — `end` z całą wypowiedzią.
// Web Speech API w WKWebView jest niepewne, dlatego w aplikacji używamy tej wtyczki.

class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SpeechPlugin"
    let jsName = "Speech"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// Po tylu sekundach ciszy od ostatniego słowa wypowiedź uznajemy za skończoną.
    private let silenceAfterSpeech: TimeInterval = 1.4
    /// Gdy nic nie padło od startu — kończymy po tym czasie.
    private let silenceAtStart: TimeInterval = 7

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "pl-PL"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var lastText = ""
    private var active = false

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": recognizer?.isAvailable ?? false])
    }

    @objc func start(_ call: CAPPluginCall) {
        requestPermissions { ok, reason in
            DispatchQueue.main.async {
                guard ok else {
                    call.reject(reason, "denied")
                    return
                }
                do {
                    try self.begin()
                    call.resolve()
                } catch {
                    self.finish(notify: false)
                    call.reject("Nie udało się uruchomić mikrofonu.", "failed", error)
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finish(notify: true)
            call.resolve()
        }
    }

    // MARK: - uprawnienia

    private func requestPermissions(_ done: @escaping (Bool, String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done(false, "Brak zgody na rozpoznawanie mowy — włącz ją w Ustawieniach iPhone'a → Dziennik.")
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                done(granted, granted ? "" : "Brak dostępu do mikrofonu — włącz go w Ustawieniach iPhone'a → Dziennik.")
            }
        }
    }

    // MARK: - nagrywanie

    private func begin() throws {
        finish(notify: false)
        guard let recognizer, recognizer.isAvailable else {
            throw NSError(domain: "Speech", code: 1, userInfo: [NSLocalizedDescriptionKey: "Rozpoznawanie mowy jest teraz niedostępne."])
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.taskHint = .dictation
        if #available(iOS 16.0, *) { req.addsPunctuation = true }

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            req.append(buffer)
        }
        engine.prepare()
        try engine.start()

        request = req
        lastText = ""
        active = true
        armSilenceTimer(silenceAtStart)

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, self.active else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    if text != self.lastText {
                        self.lastText = text
                        self.notifyListeners("partial", data: ["text": text])
                        self.armSilenceTimer(self.silenceAfterSpeech)
                    }
                    if result.isFinal { self.finish(notify: true) }
                } else if error != nil {
                    self.finish(notify: true)
                }
            }
        }
    }

    private func armSilenceTimer(_ seconds: TimeInterval) {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.finish(notify: true)
        }
    }

    /// Zatrzymuje nagrywanie; przy `notify` wysyła stronie `end` z ostatnim tekstem.
    private func finish(notify: Bool) {
        silenceTimer?.invalidate()
        silenceTimer = nil
        let wasActive = active
        active = false
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if notify && wasActive {
            notifyListeners("end", data: ["text": lastText])
        }
    }
}
