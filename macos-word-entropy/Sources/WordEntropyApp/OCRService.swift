import AppKit
import Foundation
import Vision

enum OCRServiceError: LocalizedError {
    case pasteboardImageMissing
    case cgImageConversionFailed
    case noTextRecognized
    case screenCaptureCancelledOrFailed(Int32)

    var errorDescription: String? {
        switch self {
        case .pasteboardImageMissing:
            return "剪贴板中没有图片，请先截图并复制"
        case .cgImageConversionFailed:
            return "无法读取剪贴板图片内容"
        case .noTextRecognized:
            return "OCR 未识别到文本"
        case .screenCaptureCancelledOrFailed(let status):
            return "截图选区失败或已取消（code=\(status)）"
        }
    }
}

final class OCRService {
    func captureRegionAndRecognize() throws -> String {
        try captureRegionToPasteboard()
        return try recognizeTextFromPasteboardImage()
    }

    func recognizeTextFromPasteboardImage() throws -> String {
        guard let image = NSPasteboard.general.readObjects(forClasses: [NSImage.self])?.first as? NSImage else {
            throw OCRServiceError.pasteboardImageMissing
        }

        var rect = NSRect(origin: .zero, size: image.size)
        guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
            throw OCRServiceError.cgImageConversionFailed
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])

        let lines = request.results?
            .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []

        guard !lines.isEmpty else {
            throw OCRServiceError.noTextRecognized
        }

        return lines.joined(separator: " ")
    }

    private func captureRegionToPasteboard() throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-c", "-x"]
        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw OCRServiceError.screenCaptureCancelledOrFailed(process.terminationStatus)
        }
    }
}
