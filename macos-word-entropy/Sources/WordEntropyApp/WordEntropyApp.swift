import SwiftUI
import AppKit

@main
struct WordEntropyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()
    @State private var hasRegisteredServices = false

    var body: some Scene {
        WindowGroup("词库熵减") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 760, minHeight: 720)
                .onAppear {
                    guard !hasRegisteredServices else {
                        return
                    }
                    model.registerServicesProvider()
                    hasRegisteredServices = true
                }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
