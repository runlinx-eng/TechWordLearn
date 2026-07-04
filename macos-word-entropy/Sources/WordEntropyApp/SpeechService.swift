import AppKit
import AVFoundation
import Foundation

final class SpeechService {
    private let synthesizer = NSSpeechSynthesizer()
    private var audioPlayer: AVPlayer?

    func speakEnglishWord(_ word: String, audioURL: URL? = nil) {
        let text = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return
        }

        if let audioURL {
            playAudio(url: audioURL)
            return
        }

        speakBySystemTTS(text)
    }

    private func speakBySystemTTS(_ text: String) {
        audioPlayer?.pause()
        audioPlayer = nil
        synthesizer.stopSpeaking()
        synthesizer.rate = 200
        synthesizer.startSpeaking(text)
    }

    private func playAudio(url: URL) {
        synthesizer.stopSpeaking()
        let item = AVPlayerItem(url: url)
        audioPlayer = AVPlayer(playerItem: item)
        audioPlayer?.play()
    }
}
