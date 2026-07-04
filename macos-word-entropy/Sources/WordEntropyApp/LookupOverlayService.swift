import AppKit
import SwiftUI
import WordEntropyCore

@MainActor
final class LookupOverlayService {
    private var panel: NSPanel?
    private var hostingController: NSHostingController<AnyView>?
    private var dismissTask: DispatchWorkItem?

    func showHit(
        result: LookupResult,
        count: Int,
        onSpeak: @escaping () -> Void,
        onLearn: @escaping () -> Void,
        onAdd: @escaping () -> Void
    ) {
        let view = AnyView(
            HitOverlayView(
                result: result,
                count: count,
                onSpeak: onSpeak,
                onLearn: onLearn,
                onAdd: onAdd
            )
        )
        ensurePanel(with: view, width: 430, height: 210)
        showPanelAndAutoDismiss(after: 6.0)
    }

    func showMiss(
        candidateWord: String,
        reason: String,
        onAdd: @escaping () -> Void
    ) {
        let view = AnyView(
            MissOverlayView(
                candidateWord: candidateWord,
                reason: reason,
                onAdd: onAdd
            )
        )
        ensurePanel(with: view, width: 430, height: 180)
        showPanelAndAutoDismiss(after: 7.0)
    }

    func hide() {
        dismissTask?.cancel()
        panel?.orderOut(nil)
    }

    private func ensurePanel(with rootView: AnyView, width: CGFloat, height: CGFloat) {
        if panel == nil {
            let host = NSHostingController(rootView: rootView)
            let panel = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                styleMask: [.titled, .utilityWindow, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            panel.titleVisibility = .hidden
            panel.titlebarAppearsTransparent = true
            panel.isMovableByWindowBackground = true
            panel.level = .floating
            panel.isFloatingPanel = true
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = true
            panel.hidesOnDeactivate = false
            panel.ignoresMouseEvents = false
            panel.becomesKeyOnlyIfNeeded = true
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.contentViewController = host
            panel.orderOut(nil)

            self.hostingController = host
            self.panel = panel
        } else {
            hostingController?.rootView = rootView
            if let panel {
                var frame = panel.frame
                frame.size = NSSize(width: width, height: height)
                panel.setFrame(frame, display: false)
            }
        }
    }

    private func showPanelAndAutoDismiss(after seconds: TimeInterval) {
        positionPanel()
        panel?.orderFrontRegardless()

        dismissTask?.cancel()
        let task = DispatchWorkItem { [weak self] in
            self?.panel?.orderOut(nil)
        }
        dismissTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: task)
    }

    private func positionPanel() {
        guard let panel else {
            return
        }
        guard let screen = NSScreen.main ?? NSScreen.screens.first else {
            return
        }

        let frame = screen.visibleFrame
        let origin = NSPoint(
            x: frame.maxX - panel.frame.width - 24,
            y: frame.maxY - panel.frame.height - 24
        )
        panel.setFrameOrigin(origin)
    }
}

private struct HitOverlayView: View {
    let result: LookupResult
    let count: Int
    let onSpeak: () -> Void
    let onLearn: () -> Void
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(result.lemma)
                    .font(.headline)
                Spacer()
                Text("查询次数: \(count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(result.definition)
                .font(.subheadline)
                .lineLimit(3)

            Text("输入：\(result.observedToken)")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Button("朗读") { onSpeak() }
                    .buttonStyle(.bordered)
                Button("加入词库") { onAdd() }
                    .buttonStyle(.bordered)
                Spacer()
                Button("学会") { onLearn() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(14)
        .frame(width: 430, height: 210, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .padding(4)
    }
}

private struct MissOverlayView: View {
    let candidateWord: String
    let reason: String
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("未命中词库")
                .font(.headline)
            Text("候选词：\(candidateWord)")
                .font(.subheadline.weight(.semibold))
            Text(reason)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack {
                Button("自动加入词库") { onAdd() }
                    .buttonStyle(.borderedProminent)
                Spacer()
                Text("将自动补全释义与发音")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(width: 430, height: 180, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .padding(4)
    }
}
