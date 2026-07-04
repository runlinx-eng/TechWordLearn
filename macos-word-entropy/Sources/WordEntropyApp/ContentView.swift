import SwiftUI
import Foundation
import WordEntropyCore

struct ContentView: View {
    private enum InputField {
        case customDefinition
    }

    @EnvironmentObject private var model: AppModel
    @FocusState private var focusedField: InputField?
    @State private var showingCustomWordSheet = false
    @AppStorage("word_entropy.ui.show_advanced_panels") private var showAdvancedPanels = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("词库熵减")
                    .font(.largeTitle.weight(.semibold))

                Text("极简流程：双击单词 -> ⌘⇧A 加词 / ⌘⇧M 学会 -> 回到这里确认结果")
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Button("扫描选区") {
                            model.scanWordUnitsFromSelectionContext()
                        }
                        .buttonStyle(.bordered)
                        Button("剪贴板扫描") {
                            model.scanWordUnitsFromPasteboard()
                        }
                        .buttonStyle(.bordered)
                        Button("清空") {
                            model.clearScannedWordUnits()
                        }
                        .buttonStyle(.bordered)
                        Spacer()
                        Button(showAdvancedPanels ? "隐藏高级" : "显示高级") {
                            showAdvancedPanels.toggle()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    Text("服务入口较深时，优先用快捷键：查词⌘⇧L / 加词⌘⇧A / 学会⌘⇧M")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                if showAdvancedPanels {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("窗口高度调整（尽量一屏展示）")
                            .font(.subheadline.weight(.semibold))
                        HStack {
                            Slider(value: $model.preferredWindowHeight, in: 700...1300, step: 20)
                            Text("\(Int(model.preferredWindowHeight))")
                                .foregroundStyle(.secondary)
                                .frame(width: 52, alignment: .trailing)
                        }
                        HStack {
                            Button("应用高度") {
                                model.applyPreferredWindowHeight()
                            }
                            .buttonStyle(.bordered)
                            Button("一屏推荐高度") {
                                model.applyRecommendedWindowHeight()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Label(
                        model.accessibilityTrusted ? "辅助功能权限：已授予" : "辅助功能权限：未授予",
                        systemImage: model.accessibilityTrusted ? "checkmark.shield" : "exclamationmark.shield"
                    )
                    .foregroundStyle(model.accessibilityTrusted ? .green : .orange)

                    Text("全局快捷键：\(model.hotkeyStatus)")
                        .foregroundStyle(.secondary)
                    Text("右键服务状态：\(model.servicesStatus)")
                        .foregroundStyle(.secondary)
                    Text("运行版本：\(model.appBuildTag)")
                        .foregroundStyle(.secondary)

                    if showAdvancedPanels {
                        Text("右键路径：选词 -> 右键 -> 服务 -> 词库熵减")
                            .foregroundStyle(.secondary)
                        Text("最近触发：\(model.hotkeyLastTriggeredAt)")
                            .foregroundStyle(.secondary)
                        Text("最近采集来源：\(model.lastSelectionSource)")
                            .foregroundStyle(.secondary)
                        Text("最近采集预览：\(model.lastCapturedPreview)")
                            .foregroundStyle(.secondary)

                        HStack {
                            Button("重试热键注册") {
                                model.retryHotkeyRegistration()
                            }
                            Button("重试右键服务注册") {
                                model.retryServicesRegistration()
                            }
                            Spacer()
                            Text("默认：查词⌘⇧L / 加词⌘⇧A / 学会⌘⇧M")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .font(.subheadline)

                if showAdvancedPanels {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("最近采集记录")
                            .font(.headline)
                        if model.recentCaptures.isEmpty {
                            Text("暂无采集记录")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(model.recentCaptures) { item in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    Text(item.time)
                                        .foregroundStyle(.secondary)
                                        .font(.caption)
                                    Text(item.hit ? "命中" : "未命中")
                                        .foregroundStyle(item.hit ? .green : .orange)
                                        .font(.caption)
                                    Text("[\(item.source)] \(item.preview)")
                                        .font(.subheadline)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("词单元面板")
                            .font(.headline)
                        Spacer()
                        Button("扫描选区") {
                            model.scanWordUnitsFromSelectionContext()
                        }
                        .buttonStyle(.bordered)
                        Button("剪贴板扫描") {
                            model.scanWordUnitsFromPasteboard()
                        }
                        .buttonStyle(.bordered)
                        Button("清空") {
                            model.clearScannedWordUnits()
                        }
                        .buttonStyle(.bordered)
                        if showAdvancedPanels {
                            Button("复制诊断") {
                                model.copyWordUnitDiagnosticsSnapshot()
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    Text("词元统计：可操作 \(model.visibleScannedWordUnits.count) / 原始 \(model.rawWordTokenCount)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("悬停预览：\(model.hoverLastWord) | 次数 \(model.hoverPreviewCount) | 释义 \(model.hoverPreviewDefinition)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if showAdvancedPanels {
                        Text("来源应用：\(model.wordUnitAppName) (\(model.wordUnitAppBundleID))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("采集来源：\(model.wordUnitCaptureSource) | 时间：\(model.wordUnitCapturedAt)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(model.wordUnitScopeEvaluationText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("原文预览：\(model.wordUnitScanPreview)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)

                        HStack(spacing: 10) {
                            Toggle("仅目标软件", isOn: $model.wordUnitFocusAppsOnly)
                                .toggleStyle(.switch)
                            Toggle("过滤停用词", isOn: $model.wordUnitStopWordsFilterEnabled)
                                .toggleStyle(.switch)
                            Toggle("去抖", isOn: $model.wordUnitDebounceEnabled)
                                .toggleStyle(.switch)
                            Toggle("仅待处理", isOn: $model.wordUnitOnlyActionable)
                                .toggleStyle(.switch)
                        }
                        .font(.caption)

                        HStack(spacing: 10) {
                            Toggle("悬停预览", isOn: $model.hoverPreviewEnabled)
                                .toggleStyle(.switch)
                            Toggle("悬停计次", isOn: $model.hoverCountEnabled)
                                .toggleStyle(.switch)
                            HStack(spacing: 6) {
                                Text("悬停去抖 \(String(format: "%.1f", model.hoverCountDebounceSeconds))s")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Slider(value: $model.hoverCountDebounceSeconds, in: 0.3...3.0, step: 0.1)
                                    .frame(maxWidth: 120)
                            }
                            Spacer()
                            Text("悬停词：\(model.hoverLastWord)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("触发 \(model.hoverTriggeredCount)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("状态 \(model.hoverLastStatus)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .font(.caption)

                        Text("计次统计：面板 \(model.panelSourceTotalCount)（最近 \(model.panelSourceLastEventAt)） | 悬停 \(model.hoverSourceTotalCount)（最近 \(model.hoverSourceLastEventAt)） | 点击 \(model.tapSourceTotalCount)（最近 \(model.tapSourceLastEventAt)）")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        HStack(spacing: 10) {
                            Stepper("最短词长 \(model.wordUnitMinTokenLength)", value: $model.wordUnitMinTokenLength, in: 2...8)
                                .font(.caption)
                            HStack(spacing: 6) {
                                Text("去抖秒数 \(String(format: "%.1f", model.wordUnitDebounceSeconds))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Slider(value: $model.wordUnitDebounceSeconds, in: 0.2...3.0, step: 0.2)
                                    .frame(maxWidth: 120)
                            }
                            Button("恢复推荐") {
                                model.applyRecommendedWordUnitFilterSettings()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            Button("悬停验证预设") {
                                model.applyHoverValidationPreset()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }

                        Text(model.wordUnitFilterSummaryText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("悬停可测性：\(model.hoverCountReadinessText)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if model.shouldShowRevealMasteredHint {
                            Button("显示已学会词（用于悬停验证）") {
                                model.revealMasteredWordsForHoverValidation()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }

                    if model.visibleScannedWordUnits.isEmpty {
                        Text("暂无可操作词单元，请先扫描选区或剪贴板")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(model.visibleScannedWordUnits.prefix(18))) { unit in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 8) {
                                    Button {
                                        model.handleWordUnitTap(unit)
                                    } label: {
                                        Label(unit.normalizedToken, systemImage: unit.inVocabulary ? "book.fill" : "plus.circle.fill")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(unit.inVocabulary ? .green : .primary)
                                    }
                                    .buttonStyle(.plain)
                                    .help("点击朗读并计次")
                                    .onHover { inside in
                                        model.handleWordUnitHover(unit, entered: inside)
                                    }
                                    .onContinuousHover { phase in
                                        switch phase {
                                        case .active:
                                            model.handleWordUnitHover(unit, entered: true)
                                        case .ended:
                                            model.handleWordUnitHover(unit, entered: false)
                                        }
                                    }
                                    Text(unit.inVocabulary ? "在库词" : "新词")
                                        .font(.caption)
                                        .foregroundStyle(unit.inVocabulary ? .green : .orange)
                                    if unit.specialMarked {
                                        Text("特殊")
                                            .font(.caption2)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.yellow.opacity(0.25))
                                            .clipShape(Capsule())
                                    }
                                    if unit.mastered {
                                        Text("已掌握")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("次数 \(unit.lookupCount)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                HStack(spacing: 8) {
                                    Button(model.primaryActionTitle(for: unit)) {
                                        model.triggerPrimaryAction(for: unit)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                    .disabled(!model.primaryActionEnabled(for: unit))
                                    Button("记1次") {
                                        model.recordWordUnitLookup(unit)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                    Button("朗读") {
                                        model.speakWordUnit(unit)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                    Button("朗读+1") {
                                        model.handleWordUnitTap(unit)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                }
                                if unit.rawToken != unit.normalizedToken {
                                    Text("词形：\(unit.rawToken) -> \(unit.normalizedToken)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(unit.inVocabulary ? Color.green.opacity(0.08) : Color.clear)
                            )
                            .contextMenu {
                                if !unit.inVocabulary {
                                    Button("加入新词") {
                                        model.addWordUnitToLexicon(unit)
                                    }
                                } else if !unit.mastered {
                                    Button("去掉旧词（学会）") {
                                        model.markWordUnitAsLearned(unit)
                                    }
                                } else {
                                    Button("已去掉旧词（已学会）") { }
                                        .disabled(true)
                                }
                                Divider()
                                if unit.inVocabulary {
                                    Button("朗读并计次") {
                                        model.handleWordUnitTap(unit)
                                    }
                                    Button("记1次") {
                                        model.recordWordUnitLookup(unit)
                                    }
                                }
                                Button("朗读") {
                                    model.speakWordUnit(unit)
                                }
                            }
                            .onHover { inside in
                                model.handleWordUnitHover(unit, entered: inside)
                            }
                            .onContinuousHover { phase in
                                switch phase {
                                case .active:
                                    model.handleWordUnitHover(unit, entered: true)
                                case .ended:
                                    model.handleWordUnitHover(unit, entered: false)
                                }
                            }
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                if showAdvancedPanels {
                    HStack {
                        Label(
                            model.screenRecordingTrusted ? "屏幕录制权限：已授予" : "屏幕录制权限：未授予",
                            systemImage: model.screenRecordingTrusted ? "checkmark.rectangle" : "rectangle.badge.exclamationmark"
                        )
                        .foregroundStyle(model.screenRecordingTrusted ? .green : .orange)
                        Spacer()
                        if !model.screenRecordingTrusted {
                            Button("开启屏幕录制权限") {
                                model.requestScreenRecordingPermission()
                            }
                        }
                    }
                    .font(.subheadline)

                    HStack(spacing: 10) {
                        TextField("例如: algorithms / parsed / variable", text: $model.inputText)
                            .textFieldStyle(.roundedBorder)

                        Button("查询") {
                            model.lookup()
                        }
                        .keyboardShortcut(.return, modifiers: [])

                        Button("剪贴板查询") {
                            model.lookupFromPasteboard()
                        }

                        Button("选中文本查询") {
                            model.lookupFromSelectionContext()
                        }

                        Button("图片OCR查询") {
                            model.lookupFromPasteboardOCR()
                        }

                        Button("截图OCR查询") {
                            model.captureRegionAndLookupOCR()
                        }

                        if !model.accessibilityTrusted {
                            Button("开启辅助功能权限") {
                                model.requestAccessibilityPermission()
                            }
                        }
                    }
                    .lineLimit(1)

                    Toggle("查询即计数", isOn: $model.countOnLookupEnabled)
                        .toggleStyle(.switch)
                        .font(.subheadline)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("命中诊断")
                            .font(.headline)
                        Text("候选词元: \(model.diagnosticsTokensText)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("可命中词根: \(model.diagnosticsMatchedLemmasText)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("未命中说明: \(model.diagnosticsMissReasonText)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        HStack {
                            Button("首词填入自定义词") {
                                model.fillCustomWordFromDiagnosticsCandidate()
                                model.activateMainWindowForInput()
                                showingCustomWordSheet = true
                            }
                            .buttonStyle(.bordered)
                            Button("激活并聚焦释义输入") {
                                model.activateMainWindowForInput()
                                focusedField = .customDefinition
                            }
                            .buttonStyle(.bordered)
                            Text("用于快速补齐词库")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("特殊标记速览")
                                .font(.headline)
                            Spacer()
                            Text("共 \(model.specialMarkedCount) 个")
                                .foregroundStyle(.secondary)
                        }
                        if model.specialMarkedWordsPreview.isEmpty {
                            Text("暂无特殊标记")
                                .foregroundStyle(.secondary)
                        } else {
                            Text(model.specialMarkedWordsPreview.prefix(8).map { "★ \($0)" }.joined(separator: "  "))
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                                .lineLimit(2)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    if let result = model.lookupResult {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("命中词根: \(result.lemma)")
                                    .font(.headline)
                                Text(model.currentResultSpecialMarked ? "★ 已标记" : "未标记")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(model.currentResultSpecialMarked ? Color.orange.opacity(0.18) : Color.gray.opacity(0.15))
                                    .clipShape(Capsule())
                                Spacer()
                                Button(model.currentResultSpecialMarked ? "取消特殊标记" : "添加特殊标记") {
                                    model.toggleSpecialMarkForCurrentWord()
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                Button("朗读") {
                                    model.speakCurrentWord()
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                Button("标记已掌握") {
                                    model.markCurrentAsMastered()
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                            }
                            Text("原始输入: \(result.observedToken)")
                                .foregroundStyle(.secondary)
                            Text("释义: \(result.definition)")
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        Text("暂无结果")
                            .foregroundStyle(.secondary)
                    }

                    Divider()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("添加自定义词")
                            .font(.headline)

                        HStack(alignment: .top) {
                            TextField("单词", text: $model.customWordText)
                                .textFieldStyle(.roundedBorder)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("释义（可输入多行）")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                TextEditor(text: $model.customDefinitionText)
                                    .focused($focusedField, equals: .customDefinition)
                                    .font(.body)
                                    .frame(minHeight: 62, maxHeight: 92)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Color.gray.opacity(0.35), lineWidth: 1)
                                    )
                            }
                            VStack(alignment: .leading, spacing: 8) {
                                Button(model.customAutoFillLoading ? "自动补全中..." : "自动补全释义+发音") {
                                    model.autoFillCustomWordDefinitionAndPronunciation()
                                }
                                .buttonStyle(.bordered)
                                .disabled(model.customAutoFillLoading)
                                Button("试听发音") {
                                    model.speakCustomWordPreview()
                                }
                                .buttonStyle(.bordered)
                                Button("添加") {
                                    model.addCustomWord()
                                }
                                .buttonStyle(.borderedProminent)
                                Button("弹出补词窗口（推荐）") {
                                    model.activateMainWindowForInput()
                                    showingCustomWordSheet = true
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                        if !model.customPhoneticText.isEmpty {
                            Text("自动音标：\(model.customPhoneticText)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("统计概览")
                                .font(.headline)
                            Spacer()
                            Text("累计查询: \(model.totalLookups)")
                                .foregroundStyle(.secondary)
                            Text("特殊标记: \(model.specialMarkedCount)")
                                .foregroundStyle(.secondary)
                            Button("导出CSV") {
                                model.exportStatisticsCSV()
                            }
                            .buttonStyle(.bordered)
                        }

                        HStack {
                            Text("排序")
                                .font(.subheadline.weight(.semibold))
                            Picker("排序方式", selection: $model.topWordsSortMode) {
                                ForEach(TopWordsSortMode.allCases) { mode in
                                    Text(mode.rawValue).tag(mode)
                                }
                            }
                            .pickerStyle(.segmented)
                            .frame(maxWidth: 260)
                            Spacer()
                        }

                        HStack {
                            Button("导出备份JSON") {
                                model.exportBackupJSON()
                            }
                            .buttonStyle(.bordered)
                            Button("导入最新备份JSON") {
                                model.importLatestBackupJSON()
                            }
                            .buttonStyle(.bordered)
                            Text("用于双机手动同步")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        }

                        if model.topWords.isEmpty {
                            Text("还没有统计数据")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(model.topWords) { item in
                                HStack {
                                    Text(model.displayWordWithMark(item.word))
                                    Spacer()
                                    Text("\(item.count)")
                                        .foregroundStyle(.secondary)
                                }
                                .font(.subheadline)
                            }
                        }

                        Divider()

                        Text("来源分布")
                            .font(.subheadline.weight(.semibold))
                        if model.sourceStats.isEmpty {
                            Text("暂无来源数据")
                                .foregroundStyle(.secondary)
                                .font(.subheadline)
                        } else {
                            ForEach(model.sourceStats) { item in
                                HStack {
                                    Text(item.source)
                                    Spacer()
                                    Text("\(item.count)")
                                        .foregroundStyle(.secondary)
                                }
                                .font(.subheadline)
                            }
                        }

                        Divider()

                        Text("最近入库事件")
                            .font(.subheadline.weight(.semibold))
                        if model.recentEvents.isEmpty {
                            Text("暂无事件")
                                .foregroundStyle(.secondary)
                                .font(.subheadline)
                        } else {
                            ForEach(model.recentEvents) { event in
                                Text(
                                    "[\(event.source)] [\(event.appName.isEmpty ? "未知应用" : event.appName)] \(model.displayWordWithMark(event.word)) <- \(event.observedToken)"
                                )
                                    .font(.caption)
                                    .lineLimit(1)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    Divider()
                }

                HStack {
                    Text(model.statusText)
                    Spacer()
                    Text("词库总量: \(model.vocabularySize)")
                        .foregroundStyle(.secondary)
                }
                .font(.footnote)
            }
            .padding(20)
        }
        .sheet(isPresented: $showingCustomWordSheet) {
            CustomWordEntrySheet(isPresented: $showingCustomWordSheet)
                .environmentObject(model)
        }
    }
}

private struct CustomWordEntrySheet: View {
    private enum SheetInputField {
        case word
        case definition
    }

    @EnvironmentObject private var model: AppModel
    @Binding var isPresented: Bool
    @FocusState private var focusedField: SheetInputField?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("补充自定义词")
                .font(.headline)

            TextField("单词", text: $model.customWordText)
                .textFieldStyle(.roundedBorder)
                .focused($focusedField, equals: .word)

            Text("释义")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextEditor(text: $model.customDefinitionText)
                .focused($focusedField, equals: .definition)
                .frame(minHeight: 120)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.gray.opacity(0.35), lineWidth: 1)
                )

            if !model.customPhoneticText.isEmpty {
                Text("自动音标：\(model.customPhoneticText)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button("关闭") {
                    isPresented = false
                }
                Spacer()
                Button(model.customAutoFillLoading ? "自动补全中..." : "自动补全释义+发音") {
                    model.autoFillCustomWordDefinitionAndPronunciation()
                }
                .buttonStyle(.bordered)
                .disabled(model.customAutoFillLoading)
                Button("试听发音") {
                    model.speakCustomWordPreview()
                }
                .buttonStyle(.bordered)
                Button("保存并关闭") {
                    model.addCustomWord()
                    isPresented = false
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
        .frame(minWidth: 520, minHeight: 300)
        .onAppear {
            model.activateMainWindowForInput()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                focusedField = model.customWordText.isEmpty ? .word : .definition
            }
        }
    }
}
