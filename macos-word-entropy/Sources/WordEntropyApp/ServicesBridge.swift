import AppKit
import Foundation

@MainActor
final class ServicesBridge: NSObject {
    static let shared = ServicesBridge()
    static let servicePortName = "WordEntropyServiceProvider"

    private weak var model: AppModel?
    private var hasRegistered = false
    private var activationObserver: NSObjectProtocol?
    private var lastExternalAppBundleID: String = "unknown.bundle"
    private var lastExternalAppName: String = "未知应用"

    private override init() {
        super.init()
        setupActivationObserver()
        snapshotCurrentFrontmostApplication()
    }

    var statusText: String {
        hasRegistered ? "已注册（右键 -> 服务） | 最近外部：\(lastExternalAppName)" : "未注册"
    }

    func register(model: AppModel) {
        self.model = model
        NSApp.servicesProvider = self
        if !hasRegistered {
            NSRegisterServicesProvider(self, Self.servicePortName)
            hasRegistered = true
        }
        NSUpdateDynamicServices()
    }

    @objc func addSelectedWordToLexicon(
        _ pasteboard: NSPasteboard,
        userData: String?,
        error: AutoreleasingUnsafeMutablePointer<NSString?>
    ) {
        guard let text = extractSelectedText(from: pasteboard) else {
            error.pointee = "未读取到选中文本" as NSString
            return
        }
        let context = detectSourceAppContext()
        Task { @MainActor [weak self] in
            self?.model?.handleServiceAdd(
                text: text,
                sourceAppBundleID: context.bundleID,
                sourceAppName: context.appName
            )
        }
    }

    @objc func markSelectedWordAsLearned(
        _ pasteboard: NSPasteboard,
        userData: String?,
        error: AutoreleasingUnsafeMutablePointer<NSString?>
    ) {
        guard let text = extractSelectedText(from: pasteboard) else {
            error.pointee = "未读取到选中文本" as NSString
            return
        }
        let context = detectSourceAppContext()
        Task { @MainActor [weak self] in
            self?.model?.handleServiceLearn(
                text: text,
                sourceAppBundleID: context.bundleID,
                sourceAppName: context.appName
            )
        }
    }

    private func extractSelectedText(from pasteboard: NSPasteboard) -> String? {
        let raw = pasteboard.string(forType: .string)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let raw, !raw.isEmpty else {
            return nil
        }
        return raw
    }

    private func detectSourceAppContext() -> (bundleID: String, appName: String) {
        if let app = NSWorkspace.shared.frontmostApplication {
            let bundleID = app.bundleIdentifier ?? "unknown.bundle"
            let appName = app.localizedName ?? "未知应用"
            if !isSelfApp(bundleID: bundleID, appName: appName) {
                cacheExternalApp(bundleID: bundleID, appName: appName)
                return (bundleID, appName)
            }
        }

        if lastExternalAppBundleID != "unknown.bundle" {
            return (lastExternalAppBundleID, lastExternalAppName)
        }

        return ("unknown.bundle", "未知应用")
    }

    private func setupActivationObserver() {
        guard activationObserver == nil else {
            return
        }
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
                return
            }
            Task { @MainActor [weak self] in
                let bundleID = app.bundleIdentifier ?? "unknown.bundle"
                let appName = app.localizedName ?? "未知应用"
                guard let self else {
                    return
                }
                if !self.isSelfApp(bundleID: bundleID, appName: appName) {
                    self.cacheExternalApp(bundleID: bundleID, appName: appName)
                }
            }
        }
    }

    private func snapshotCurrentFrontmostApplication() {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            return
        }
        let bundleID = app.bundleIdentifier ?? "unknown.bundle"
        let appName = app.localizedName ?? "未知应用"
        if !isSelfApp(bundleID: bundleID, appName: appName) {
            cacheExternalApp(bundleID: bundleID, appName: appName)
        }
    }

    private func cacheExternalApp(bundleID: String, appName: String) {
        guard bundleID != "unknown.bundle" else {
            return
        }
        lastExternalAppBundleID = bundleID
        lastExternalAppName = appName
    }

    private func isSelfApp(bundleID: String, appName: String) -> Bool {
        let lowerBundle = bundleID.lowercased()
        let lowerName = appName.lowercased()
        return lowerBundle.contains("wordentropy") ||
            lowerName.contains("wordentropy") ||
            appName.contains("词库熵减")
    }
}
