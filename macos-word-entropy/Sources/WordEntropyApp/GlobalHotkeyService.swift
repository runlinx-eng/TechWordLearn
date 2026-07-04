import Carbon
import Foundation

final class GlobalHotkeyService {
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private let hotKeyID: UInt32
    private let keyCode: UInt32
    private let modifiers: UInt32
    private let handler: @Sendable () -> Void

    init(hotKeyID: UInt32 = 1, keyCode: UInt32, modifiers: UInt32, handler: @escaping @Sendable () -> Void) {
        self.hotKeyID = hotKeyID
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.handler = handler
    }

    deinit {
        stop()
    }

    func start() throws {
        if hotKeyRef != nil {
            return
        }

        let target = GetEventDispatcherTarget()
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))

        let installStatus = InstallEventHandler(
            target,
            hotKeyHandlerUPP,
            1,
            &eventType,
            UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()),
            &eventHandlerRef
        )

        guard installStatus == noErr else {
            throw HotkeyError.installHandlerFailed(code: installStatus)
        }

        let carbonID = EventHotKeyID(signature: OSType(0x57454E54), id: hotKeyID) // "WENT"
        let registerStatus = RegisterEventHotKey(
            keyCode,
            modifiers,
            carbonID,
            target,
            0,
            &hotKeyRef
        )

        guard registerStatus == noErr else {
            stop()
            throw HotkeyError.registerFailed(code: registerStatus)
        }
    }

    func stop() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }

    fileprivate func handleHotkeyEvent(_ event: EventRef?) -> OSStatus {
        guard let event else {
            return noErr
        }

        var receivedID = EventHotKeyID()
        let status = GetEventParameter(
            event,
            EventParamName(kEventParamDirectObject),
            EventParamType(typeEventHotKeyID),
            nil,
            MemoryLayout<EventHotKeyID>.size,
            nil,
            &receivedID
        )

        guard status == noErr else {
            return status
        }

        guard receivedID.id == hotKeyID else {
            return noErr
        }

        handler()
        return noErr
    }
}

private let hotKeyHandlerUPP: EventHandlerUPP = { _, event, userData in
    guard let userData else {
        return noErr
    }
    let service = Unmanaged<GlobalHotkeyService>.fromOpaque(userData).takeUnretainedValue()
    return service.handleHotkeyEvent(event)
}

enum HotkeyError: LocalizedError {
    case installHandlerFailed(code: OSStatus)
    case registerFailed(code: OSStatus)

    var errorDescription: String? {
        switch self {
        case .installHandlerFailed(let code):
            return "全局快捷键事件安装失败，OSStatus=\(code)"
        case .registerFailed(let code):
            return "全局快捷键注册失败，OSStatus=\(code)"
        }
    }
}
