import AppKit
import ApplicationServices
import Carbon
import Foundation

struct SelectionCaptureResult {
    let text: String
    let source: String
    let appName: String
    let appBundleID: String
}

enum SelectionCaptureError: LocalizedError {
    case emptyPasteboard
    case accessibilityPermissionDenied
    case focusedElementUnavailable
    case emptySelection
    case copyShortcutFailed
    case copyShortcutDidNotYieldText

    var errorDescription: String? {
        switch self {
        case .emptyPasteboard:
            return "剪贴板没有可用文本"
        case .accessibilityPermissionDenied:
            return "缺少辅助功能权限，请在系统设置中允许"
        case .focusedElementUnavailable:
            return "无法获取当前焦点元素"
        case .emptySelection:
            return "当前应用没有选中文本"
        case .copyShortcutFailed:
            return "无法触发复制快捷键"
        case .copyShortcutDidNotYieldText:
            return "复制后未获取到文本"
        }
    }
}

final class SelectionCaptureService {
    func isAccessibilityTrusted() -> Bool {
        AXIsProcessTrusted()
    }

    @discardableResult
    func requestAccessibilityPermissionPrompt() -> Bool {
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    func capturePreferredSelection() throws -> SelectionCaptureResult {
        let appContext = currentAppContext()
        do {
            return SelectionCaptureResult(
                text: try captureFromFocusedSelection(),
                source: "AX选区",
                appName: appContext.name,
                appBundleID: appContext.bundleID
            )
        } catch {
            do {
                return SelectionCaptureResult(
                    text: try captureFromCopyShortcut(),
                    source: "自动复制",
                    appName: appContext.name,
                    appBundleID: appContext.bundleID
                )
            } catch {
                return SelectionCaptureResult(
                    text: try captureFromPasteboard(),
                    source: "剪贴板",
                    appName: appContext.name,
                    appBundleID: appContext.bundleID
                )
            }
        }
    }

    func captureFromPasteboard() throws -> String {
        guard let raw = NSPasteboard.general.string(forType: .string)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else {
            throw SelectionCaptureError.emptyPasteboard
        }
        return raw
    }

    private func captureFromFocusedSelection() throws -> String {
        guard isAccessibilityTrusted() else {
            throw SelectionCaptureError.accessibilityPermissionDenied
        }

        let systemElement = AXUIElementCreateSystemWide()
        var focusedElementRef: CFTypeRef?
        let focusStatus = AXUIElementCopyAttributeValue(
            systemElement,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElementRef
        )

        guard focusStatus == .success, let focusedElementRef else {
            throw SelectionCaptureError.focusedElementUnavailable
        }

        let focusedElement = focusedElementRef as! AXUIElement
        var selectedTextRef: CFTypeRef?
        let selectedStatus = AXUIElementCopyAttributeValue(
            focusedElement,
            kAXSelectedTextAttribute as CFString,
            &selectedTextRef
        )

        guard selectedStatus == .success, let selectedText = selectedTextRef as? String else {
            throw SelectionCaptureError.emptySelection
        }

        let trimmed = selectedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw SelectionCaptureError.emptySelection
        }
        return trimmed
    }

    private func captureFromCopyShortcut() throws -> String {
        let pasteboard = NSPasteboard.general
        let originalChangeCount = pasteboard.changeCount

        try postCommandC()

        let deadline = Date().addingTimeInterval(0.6)
        while Date() < deadline {
            if pasteboard.changeCount != originalChangeCount,
               let copied = pasteboard.string(forType: .string)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !copied.isEmpty {
                return copied
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
        throw SelectionCaptureError.copyShortcutDidNotYieldText
    }

    private func postCommandC() throws {
        guard let source = CGEventSource(stateID: .hidSystemState),
              let keyDown = CGEvent(
                  keyboardEventSource: source,
                  virtualKey: CGKeyCode(kVK_ANSI_C),
                  keyDown: true
              ),
              let keyUp = CGEvent(
                  keyboardEventSource: source,
                  virtualKey: CGKeyCode(kVK_ANSI_C),
                  keyDown: false
              ) else {
            throw SelectionCaptureError.copyShortcutFailed
        }

        keyDown.flags = .maskCommand
        keyUp.flags = .maskCommand
        keyDown.post(tap: .cgAnnotatedSessionEventTap)
        keyUp.post(tap: .cgAnnotatedSessionEventTap)
    }

    private func currentAppContext() -> (name: String, bundleID: String) {
        let app = NSWorkspace.shared.frontmostApplication
        return (
            name: app?.localizedName ?? "未知应用",
            bundleID: app?.bundleIdentifier ?? "unknown.bundle"
        )
    }
}
