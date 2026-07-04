import AppKit
import Foundation
import Carbon
import WordEntropyCore

struct CaptureLogEntry: Identifiable {
    let id = UUID()
    let time: String
    let source: String
    let preview: String
    let hit: Bool
}

struct AppWordUnit: Identifiable, Hashable {
    let id: String
    let rawToken: String
    let normalizedToken: String
    let appName: String
    let appBundleID: String
    let captureSource: String
    let capturedAt: String
    let lookupCount: Int
    let inVocabulary: Bool
    let mastered: Bool
    let specialMarked: Bool
}

enum TopWordsSortMode: String, CaseIterable, Identifiable {
    case countDesc = "查询次数"
    case recentDesc = "最近查询"

    var id: String { rawValue }
}

@MainActor
final class AppModel: ObservableObject {
    private static let runtimeBuildTag = "2026-02-09-c02-r16"
    private static let topWordsSortModeDefaultsKey = "word_entropy.top_words_sort_mode"
    private static let minTokenLengthDefaultsKey = "word_entropy.word_unit.min_token_length"
    private static let stopWordsFilterDefaultsKey = "word_entropy.word_unit.stop_words_filter"
    private static let focusAppsOnlyDefaultsKey = "word_entropy.word_unit.focus_apps_only"
    private static let debounceEnabledDefaultsKey = "word_entropy.word_unit.debounce_enabled"
    private static let debounceSecondsDefaultsKey = "word_entropy.word_unit.debounce_seconds"
    private static let onlyActionableDefaultsKey = "word_entropy.word_unit.only_actionable"
    private static let hoverPreviewEnabledDefaultsKey = "word_entropy.hover.preview_enabled"
    private static let hoverCountEnabledDefaultsKey = "word_entropy.hover.count_enabled"
    private static let hoverCountDebounceSecondsDefaultsKey = "word_entropy.hover.count_debounce_seconds"

    @Published var inputText: String = ""
    @Published var customWordText: String = ""
    @Published var customDefinitionText: String = ""
    @Published var customPhoneticText: String = ""
    @Published var customAudioURLText: String = ""
    @Published var customAutoFillLoading: Bool = false
    @Published var lookupResult: LookupResult?
    @Published var statusText: String
    @Published var vocabularySize: Int = 0
    @Published var totalLookups: Int = 0
    @Published var topWords: [WordFrequency] = []
    @Published var topWordsSortMode: TopWordsSortMode = .countDesc {
        didSet {
            UserDefaults.standard.set(topWordsSortMode.rawValue, forKey: Self.topWordsSortModeDefaultsKey)
            refreshStats()
        }
    }
    @Published var sourceStats: [SourceFrequency] = []
    @Published var recentEvents: [LookupEventRow] = []
    @Published var specialMarkedCount: Int = 0
    @Published var specialMarkedWordsPreview: [String] = []
    @Published var currentResultSpecialMarked: Bool = false
    @Published var diagnosticsTokensText: String = "无"
    @Published var diagnosticsMatchedLemmasText: String = "无"
    @Published var diagnosticsMissReasonText: String = "无"
    @Published var preferredWindowHeight: Double = 980
    @Published var accessibilityTrusted: Bool = false
    @Published var screenRecordingTrusted: Bool = false
    @Published var hotkeyStatus: String = "未初始化"
    @Published var hotkeyLastTriggeredAt: String = "未触发"
    @Published var servicesStatus: String = "未注册"
    @Published var lastSelectionSource: String = "未采集"
    @Published var lastCapturedPreview: String = "无"
    @Published var recentCaptures: [CaptureLogEntry] = []
    @Published var countOnLookupEnabled: Bool = true
    @Published var wordUnitAppName: String = "未扫描"
    @Published var wordUnitAppBundleID: String = "-"
    @Published var wordUnitCaptureSource: String = "未扫描"
    @Published var wordUnitCapturedAt: String = "未扫描"
    @Published var wordUnitScopeEvaluationText: String = "未评估"
    @Published var wordUnitScanPreview: String = "无"
    @Published var rawWordTokenCount: Int = 0
    @Published var filteredWordTokenCount: Int = 0
    @Published var scannedWordUnits: [AppWordUnit] = []
    @Published var wordUnitFilteredByLengthCount: Int = 0
    @Published var wordUnitFilteredByCharacterCount: Int = 0
    @Published var wordUnitFilteredByStopWordCount: Int = 0
    @Published var wordUnitFilteredByDuplicateCount: Int = 0
    @Published var wordUnitFilteredByMasteredCount: Int = 0
    @Published var wordUnitIgnoredOutOfScopeCount: Int = 0
    @Published var wordUnitMinTokenLength: Int = 2 {
        didSet {
            let clamped = min(max(wordUnitMinTokenLength, 2), 8)
            if clamped != wordUnitMinTokenLength {
                wordUnitMinTokenLength = clamped
                return
            }
            UserDefaults.standard.set(wordUnitMinTokenLength, forKey: Self.minTokenLengthDefaultsKey)
            refreshScannedWordUnits()
        }
    }
    @Published var wordUnitStopWordsFilterEnabled: Bool = true {
        didSet {
            UserDefaults.standard.set(wordUnitStopWordsFilterEnabled, forKey: Self.stopWordsFilterDefaultsKey)
            refreshScannedWordUnits()
        }
    }
    @Published var wordUnitFocusAppsOnly: Bool = true {
        didSet {
            UserDefaults.standard.set(wordUnitFocusAppsOnly, forKey: Self.focusAppsOnlyDefaultsKey)
            refreshScannedWordUnits()
        }
    }
    @Published var wordUnitDebounceEnabled: Bool = true {
        didSet {
            UserDefaults.standard.set(wordUnitDebounceEnabled, forKey: Self.debounceEnabledDefaultsKey)
        }
    }
    @Published var wordUnitDebounceSeconds: Double = 1.2 {
        didSet {
            let clamped = min(max(wordUnitDebounceSeconds, 0.2), 5.0)
            if clamped != wordUnitDebounceSeconds {
                wordUnitDebounceSeconds = clamped
                return
            }
            UserDefaults.standard.set(wordUnitDebounceSeconds, forKey: Self.debounceSecondsDefaultsKey)
        }
    }
    @Published var wordUnitOnlyActionable: Bool = true {
        didSet {
            UserDefaults.standard.set(wordUnitOnlyActionable, forKey: Self.onlyActionableDefaultsKey)
            refreshScannedWordUnits()
        }
    }
    @Published var hoverPreviewEnabled: Bool = true {
        didSet {
            UserDefaults.standard.set(hoverPreviewEnabled, forKey: Self.hoverPreviewEnabledDefaultsKey)
        }
    }
    @Published var hoverCountEnabled: Bool = true {
        didSet {
            UserDefaults.standard.set(hoverCountEnabled, forKey: Self.hoverCountEnabledDefaultsKey)
        }
    }
    @Published var hoverCountDebounceSeconds: Double = 1.5 {
        didSet {
            let clamped = min(max(hoverCountDebounceSeconds, 0.3), 5.0)
            if clamped != hoverCountDebounceSeconds {
                hoverCountDebounceSeconds = clamped
                return
            }
            UserDefaults.standard.set(
                hoverCountDebounceSeconds,
                forKey: Self.hoverCountDebounceSecondsDefaultsKey
            )
        }
    }
    @Published var hoverLastWord: String = "无"
    @Published var hoverPreviewDefinition: String = "无"
    @Published var hoverPreviewCount: Int = 0
    @Published var hoverTriggeredCount: Int = 0
    @Published var hoverLastStatus: String = "未触发"
    @Published var panelSourceTotalCount: Int = 0
    @Published var hoverSourceTotalCount: Int = 0
    @Published var tapSourceTotalCount: Int = 0
    @Published var panelSourceLastEventAt: String = "无"
    @Published var hoverSourceLastEventAt: String = "无"
    @Published var tapSourceLastEventAt: String = "无"
    @Published var appBuildTag: String = AppModel.runtimeBuildTag

    private let engine: WordEngine
    private let store: SQLiteLookupStore?
    private let selectionCaptureService = SelectionCaptureService()
    private let ocrService = OCRService()
    private let autoFillService = LexiconAutoFillService()
    private let speechService = SpeechService()
    private let exportService = ExportService()
    private let backupService = BackupService()
    private let overlayService = LookupOverlayService()
    private var hotkeyServices: [GlobalHotkeyService] = []
    private var specialMarkedWords: Set<String> = []
    private var masteredWords: Set<String> = []
    private var vocabularyKeys: Set<String> = []
    private var lastWordUnitCaptureText: String = ""
    private var lastWordUnitContext: SelectionCaptureResult?
    private var lastWordUnitScanSignature: String?
    private var lastWordUnitScanAt: Date?
    private var lastHoverCountAtByWord: [String: Date] = [:]
    private var lastHoverUITriggerAtByUnitID: [String: Date] = [:]
    private var lastLookupAppBundleID: String = "unknown.bundle"
    private var lastLookupAppName: String = "未知应用"

    init() {
        var resolvedEngine: WordEngine
        var resolvedStore: SQLiteLookupStore?
        var resolvedVocabularySize: Int
        var resolvedStatusText: String
        var resolvedSpecialMarkedWords: Set<String> = []
        var resolvedMasteredWords: Set<String> = []
        var resolvedVocabularyKeys: Set<String> = []

        do {
            let baseDefinitions = try Self.loadVocabularyFromResources()
            resolvedStore = try Self.makeLookupStore()
            let customDefinitions = try resolvedStore?.loadCustomVocabulary() ?? [:]
            resolvedMasteredWords = try resolvedStore?.loadMasteredWords() ?? []
            resolvedSpecialMarkedWords = try resolvedStore?.loadSpecialMarkedWords() ?? []
            let mergedDefinitions = baseDefinitions.merging(customDefinitions) { _, custom in custom }
            resolvedVocabularyKeys = Set(mergedDefinitions.keys)

            resolvedEngine = WordEngine(definitions: mergedDefinitions, masteredWords: resolvedMasteredWords)
            resolvedVocabularySize = mergedDefinitions.count
            resolvedStatusText = "词库已加载：\(mergedDefinitions.count) 词（含自定义 \(customDefinitions.count)）"
        } catch {
            resolvedEngine = WordEngine(definitions: [:])
            resolvedStore = nil
            resolvedVocabularySize = 0
            resolvedStatusText = "词库加载失败：\(error.localizedDescription)"
        }

        self.engine = resolvedEngine
        self.store = resolvedStore
        self.vocabularySize = resolvedVocabularySize
        self.statusText = resolvedStatusText
        self.specialMarkedWords = resolvedSpecialMarkedWords
        self.specialMarkedCount = resolvedSpecialMarkedWords.count
        self.specialMarkedWordsPreview = resolvedSpecialMarkedWords.sorted()
        self.masteredWords = resolvedMasteredWords
        self.vocabularyKeys = resolvedVocabularyKeys
        self.accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
        self.screenRecordingTrusted = PermissionService.hasScreenRecordingPermission()
        self.topWordsSortMode = Self.loadTopWordsSortModeFromDefaults()
        self.wordUnitMinTokenLength = min(
            max(
                Self.loadIntDefaults(
                    key: Self.minTokenLengthDefaultsKey,
                    fallback: 2
                ),
                2
            ),
            8
        )
        self.wordUnitStopWordsFilterEnabled = Self.loadBoolDefaults(
            key: Self.stopWordsFilterDefaultsKey,
            fallback: true
        )
        self.wordUnitFocusAppsOnly = Self.loadBoolDefaults(
            key: Self.focusAppsOnlyDefaultsKey,
            fallback: true
        )
        self.wordUnitDebounceEnabled = Self.loadBoolDefaults(
            key: Self.debounceEnabledDefaultsKey,
            fallback: true
        )
        self.wordUnitDebounceSeconds = min(
            max(
                Self.loadDoubleDefaults(
                    key: Self.debounceSecondsDefaultsKey,
                    fallback: 1.2
                ),
                0.2
            ),
            5.0
        )
        self.wordUnitOnlyActionable = Self.loadBoolDefaults(
            key: Self.onlyActionableDefaultsKey,
            fallback: true
        )
        self.hoverPreviewEnabled = Self.loadBoolDefaults(
            key: Self.hoverPreviewEnabledDefaultsKey,
            fallback: true
        )
        self.hoverCountEnabled = Self.loadBoolDefaults(
            key: Self.hoverCountEnabledDefaultsKey,
            fallback: true
        )
        self.hoverCountDebounceSeconds = min(
            max(
                Self.loadDoubleDefaults(
                    key: Self.hoverCountDebounceSecondsDefaultsKey,
                    fallback: 1.5
                ),
                0.3
            ),
            5.0
        )
        refreshStats()
        setupGlobalHotkey()
    }

    @discardableResult
    func lookup(source: String = "手动输入") -> Bool {
        if source == "手动输入" {
            lastLookupAppBundleID = currentFrontmostBundleID()
            lastLookupAppName = currentFrontmostAppName()
        }
        let diagnostics = analyzeInput(inputText)
        diagnosticsTokensText = diagnostics.tokenPreview
        diagnosticsMatchedLemmasText = diagnostics.lemmaPreview

        lookupResult = engine.lookup(rawText: inputText)
        if lookupResult == nil {
            statusText = Self.makeMissStatus(from: diagnostics)
            diagnosticsMissReasonText = statusText
            currentResultSpecialMarked = false

            if diagnostics.matchedLemmas.isEmpty, let candidateWord = diagnostics.tokens.first {
                overlayService.showMiss(
                    candidateWord: candidateWord,
                    reason: statusText,
                    onAdd: { [weak self] in
                        self?.autoAddWordFromMissCandidate(candidateWord)
                    }
                )
            } else {
                overlayService.hide()
            }
            return false
        } else {
            diagnosticsMissReasonText = "命中"
            if let result = lookupResult {
                let count: Int
                if countOnLookupEnabled {
                    statusText = "已命中并记录查询"
                    count = persistLookup(source: source) ?? 1
                } else {
                    statusText = "已命中（计数已关闭）"
                    count = readLookupCount(for: result.lemma) ?? 0
                }
                currentResultSpecialMarked = specialMarkedWords.contains(result.lemma)
                overlayService.showHit(
                    result: result,
                    count: count,
                    onSpeak: { [weak self] in
                        self?.speakCurrentWord()
                    },
                    onLearn: { [weak self] in
                        self?.markCurrentAsMastered()
                        self?.overlayService.hide()
                    },
                    onAdd: { [weak self] in
                        self?.ensureSpecialMarkForCurrentWord()
                    }
                )
            }
            return true
        }
    }

    func lookupFromPasteboard() {
        do {
            let text = try selectionCaptureService.captureFromPasteboard()
            _ = applyCapturedTextAndLookup(
                text: text,
                source: "手动剪贴板",
                appBundleID: currentFrontmostBundleID(),
                appName: currentFrontmostAppName()
            )
            applyWordUnitScan(
                capture: SelectionCaptureResult(
                    text: text,
                    source: "手动剪贴板",
                    appName: currentFrontmostAppName(),
                    appBundleID: currentFrontmostBundleID()
                ),
                updateStatus: false
            )
        } catch {
            statusText = "采集失败：\(error.localizedDescription)"
        }
    }

    func lookupFromSelectionContext() {
        do {
            let capture = try selectionCaptureService.capturePreferredSelection()
            _ = applyCapturedTextAndLookup(
                text: capture.text,
                source: capture.source,
                appBundleID: capture.appBundleID,
                appName: capture.appName
            )
            applyWordUnitScan(capture: capture, updateStatus: false)
            statusText += " | 采集来源: \(capture.source)"
        } catch SelectionCaptureError.accessibilityPermissionDenied {
            _ = selectionCaptureService.requestAccessibilityPermissionPrompt()
            accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
            statusText = "请开启辅助功能权限后重试（系统设置 -> 隐私与安全性 -> 辅助功能）"
            lastSelectionSource = "权限不足"
            lastCapturedPreview = "无"
        } catch {
            statusText = "选词采集失败：\(error.localizedDescription)"
            lastSelectionSource = "失败"
            lastCapturedPreview = "无"
        }
    }

    func requestAccessibilityPermission() {
        _ = selectionCaptureService.requestAccessibilityPermissionPrompt()
        accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
        statusText = accessibilityTrusted
            ? "辅助功能权限已可用"
            : "辅助功能权限仍未授予"
    }

    func registerServicesProvider() {
        ServicesBridge.shared.register(model: self)
        servicesStatus = ServicesBridge.shared.statusText
        if servicesStatus.contains("已注册") {
            statusText = "右键服务已注册，可在“服务”菜单里触发加词/学会"
        }
    }

    func retryServicesRegistration() {
        registerServicesProvider()
    }

    func requestScreenRecordingPermission() {
        _ = PermissionService.requestScreenRecordingPermission()
        screenRecordingTrusted = PermissionService.hasScreenRecordingPermission()
        statusText = screenRecordingTrusted
            ? "屏幕录制权限已可用"
            : "屏幕录制权限仍未授予"
    }

    func lookupFromPasteboardOCR() {
        do {
            let text = try ocrService.recognizeTextFromPasteboardImage()
            _ = applyCapturedTextAndLookup(
                text: text,
                source: "图片OCR",
                appBundleID: currentFrontmostBundleID(),
                appName: currentFrontmostAppName()
            )
            applyWordUnitScan(
                capture: SelectionCaptureResult(
                    text: text,
                    source: "图片OCR",
                    appName: currentFrontmostAppName(),
                    appBundleID: currentFrontmostBundleID()
                ),
                updateStatus: false
            )
            statusText += " | 来源: 图片OCR"
        } catch {
            statusText = "OCR 失败：\(error.localizedDescription)"
        }
    }

    func captureRegionAndLookupOCR() {
        do {
            let text = try ocrService.captureRegionAndRecognize()
            _ = applyCapturedTextAndLookup(
                text: text,
                source: "截图OCR",
                appBundleID: currentFrontmostBundleID(),
                appName: currentFrontmostAppName()
            )
            applyWordUnitScan(
                capture: SelectionCaptureResult(
                    text: text,
                    source: "截图OCR",
                    appName: currentFrontmostAppName(),
                    appBundleID: currentFrontmostBundleID()
                ),
                updateStatus: false
            )
            statusText += " | 来源: 截图OCR"
        } catch {
            statusText = "截图 OCR 失败：\(error.localizedDescription)"
        }
    }

    func scanWordUnitsFromSelectionContext() {
        do {
            let capture = try selectionCaptureService.capturePreferredSelection()
            applyWordUnitScan(capture: capture, updateStatus: true)
            appendCaptureLog(source: "词单元扫描-\(capture.source)", text: capture.text, hit: !scannedWordUnits.isEmpty)
        } catch SelectionCaptureError.accessibilityPermissionDenied {
            _ = selectionCaptureService.requestAccessibilityPermissionPrompt()
            accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
            statusText = "词单元扫描失败：请先授予辅助功能权限"
        } catch {
            statusText = "词单元扫描失败：\(error.localizedDescription)"
        }
    }

    func scanWordUnitsFromPasteboard() {
        do {
            let text = try selectionCaptureService.captureFromPasteboard()
            let capture = SelectionCaptureResult(
                text: text,
                source: "词单元-剪贴板",
                appName: currentFrontmostAppName(),
                appBundleID: currentFrontmostBundleID()
            )
            applyWordUnitScan(capture: capture, updateStatus: true)
            appendCaptureLog(source: capture.source, text: text, hit: !scannedWordUnits.isEmpty)
        } catch {
            statusText = "词单元扫描失败：\(error.localizedDescription)"
        }
    }

    func clearScannedWordUnits() {
        lastWordUnitCaptureText = ""
        lastWordUnitContext = nil
        scannedWordUnits = []
        rawWordTokenCount = 0
        filteredWordTokenCount = 0
        wordUnitFilteredByLengthCount = 0
        wordUnitFilteredByCharacterCount = 0
        wordUnitFilteredByStopWordCount = 0
        wordUnitFilteredByDuplicateCount = 0
        wordUnitFilteredByMasteredCount = 0
        wordUnitIgnoredOutOfScopeCount = 0
        wordUnitAppName = "未扫描"
        wordUnitAppBundleID = "-"
        wordUnitCaptureSource = "未扫描"
        wordUnitCapturedAt = "未扫描"
        wordUnitScopeEvaluationText = "未评估"
        wordUnitScanPreview = "无"
        resetHoverPreviewState()
        refreshStats()
        statusText = "已清空词单元列表"
    }

    func copyWordUnitDiagnosticsSnapshot() {
        var lines: [String] = []
        lines.append("词库熵减诊断摘要")
        lines.append("时间：\(Self.nowTimeString())")
        lines.append("运行版本：\(appBuildTag)")
        lines.append("来源应用：\(wordUnitAppName) (\(wordUnitAppBundleID))")
        lines.append("采集来源：\(wordUnitCaptureSource) | 采集时间：\(wordUnitCapturedAt)")
        lines.append(wordUnitScopeEvaluationText)
        lines.append("过滤开关：仅目标软件=\(wordUnitFocusAppsOnly ? "开" : "关")、过滤停用词=\(wordUnitStopWordsFilterEnabled ? "开" : "关")、去抖=\(wordUnitDebounceEnabled ? "开" : "关")、仅待处理=\(wordUnitOnlyActionable ? "开" : "关")")
        lines.append("过滤参数：最短词长=\(wordUnitMinTokenLength)、扫描去抖=\(String(format: "%.1f", wordUnitDebounceSeconds))s")
        lines.append("悬停参数：预览=\(hoverPreviewEnabled ? "开" : "关")、计次=\(hoverCountEnabled ? "开" : "关")、去抖=\(String(format: "%.1f", hoverCountDebounceSeconds))s")
        lines.append("悬停状态：词=\(hoverLastWord)、触发=\(hoverTriggeredCount)、状态=\(hoverLastStatus)")
        lines.append("悬停可测性：\(hoverCountReadinessText)（可见在库词=\(visibleHoverCountableWordCount)、隐藏已学会在库词=\(hiddenMasteredInVocabularyCount)）")
        lines.append("词元统计：原始=\(rawWordTokenCount)、过滤=\(filteredWordTokenCount)、可操作=\(visibleScannedWordUnits.count)")
        lines.append(wordUnitFilterSummaryText)
        lines.append("来源计次：面板=\(panelSourceTotalCount)（最近 \(panelSourceLastEventAt)） | 悬停=\(hoverSourceTotalCount)（最近 \(hoverSourceLastEventAt)） | 点击=\(tapSourceTotalCount)（最近 \(tapSourceLastEventAt)）")

        if recentEvents.isEmpty {
            lines.append("最近事件：无")
        } else {
            lines.append("最近事件（前3）：")
            for event in recentEvents.prefix(3) {
                let app = event.appName.isEmpty ? "未知应用" : event.appName
                lines.append("- [\(event.source)] [\(app)] \(event.word) <- \(event.observedToken)")
            }
        }

        let output = lines.joined(separator: "\n")
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(output, forType: .string)
        statusText = "已复制词单元诊断摘要（可直接粘贴回传）"
    }

    var wordUnitFilterSummaryText: String {
        var parts: [String] = []
        if wordUnitIgnoredOutOfScopeCount > 0 {
            parts.append("范围过滤 \(wordUnitIgnoredOutOfScopeCount)")
        }
        if wordUnitFilteredByLengthCount > 0 {
            parts.append("长度过滤 \(wordUnitFilteredByLengthCount)")
        }
        if wordUnitFilteredByCharacterCount > 0 {
            parts.append("字符过滤 \(wordUnitFilteredByCharacterCount)")
        }
        if wordUnitFilteredByStopWordCount > 0 {
            parts.append("停用词过滤 \(wordUnitFilteredByStopWordCount)")
        }
        if wordUnitFilteredByDuplicateCount > 0 {
            parts.append("重复过滤 \(wordUnitFilteredByDuplicateCount)")
        }
        if wordUnitFilteredByMasteredCount > 0 {
            parts.append("已学会隐藏 \(wordUnitFilteredByMasteredCount)")
        }
        if parts.isEmpty {
            return "过滤摘要：无"
        }
        return "过滤摘要：\(parts.joined(separator: " | "))"
    }

    func applyRecommendedWordUnitFilterSettings() {
        wordUnitFocusAppsOnly = true
        wordUnitStopWordsFilterEnabled = true
        wordUnitDebounceEnabled = true
        wordUnitDebounceSeconds = 1.2
        wordUnitMinTokenLength = 2
        wordUnitOnlyActionable = true
        statusText = "已恢复推荐过滤参数"
    }

    func applyHoverValidationPreset() {
        wordUnitFocusAppsOnly = true
        wordUnitStopWordsFilterEnabled = true
        wordUnitDebounceEnabled = true
        wordUnitDebounceSeconds = 1.2
        wordUnitMinTokenLength = 2
        wordUnitOnlyActionable = false
        hoverPreviewEnabled = true
        hoverCountEnabled = true
        hoverCountDebounceSeconds = min(max(hoverCountDebounceSeconds, 0.3), 5.0)
        statusText = "已切换悬停验证预设（显示已学会词 + 启用悬停计次）"
    }

    var visibleScannedWordUnits: [AppWordUnit] {
        if wordUnitOnlyActionable && !shouldKeepMasteredVisibleInCurrentContext {
            return scannedWordUnits.filter { !$0.mastered }
        }
        return scannedWordUnits
    }

    var visibleHoverCountableWordCount: Int {
        visibleScannedWordUnits.filter { $0.inVocabulary }.count
    }

    var hiddenMasteredInVocabularyCount: Int {
        guard wordUnitOnlyActionable, !shouldKeepMasteredVisibleInCurrentContext else {
            return 0
        }
        return scannedWordUnits.filter { $0.inVocabulary && $0.mastered }.count
    }

    var shouldShowRevealMasteredHint: Bool {
        hoverCountEnabled &&
        wordUnitOnlyActionable &&
        visibleHoverCountableWordCount == 0 &&
        hiddenMasteredInVocabularyCount > 0
    }

    var hoverCountReadinessText: String {
        guard hoverCountEnabled else {
            return "悬停计次已关闭"
        }
        if visibleHoverCountableWordCount > 0 {
            return "可悬停计次（当前列表含在库词）"
        }
        if hiddenMasteredInVocabularyCount > 0 {
            return "当前列表无可计次在库词（仅待处理隐藏了已学会在库词）"
        }
        return "当前列表仅新词，悬停仅预览不计次"
    }

    func revealMasteredWordsForHoverValidation() {
        wordUnitOnlyActionable = false
        statusText = "已显示已学会词，可用于悬停计次验证"
    }

    private var shouldKeepMasteredVisibleInCurrentContext: Bool {
        wordUnitCaptureSource.hasPrefix("右键服务-")
    }

    func primaryActionTitle(for unit: AppWordUnit) -> String {
        if !unit.inVocabulary {
            return "入库"
        }
        if unit.mastered {
            return "已学会"
        }
        return "学会"
    }

    func primaryActionEnabled(for unit: AppWordUnit) -> Bool {
        !unit.mastered
    }

    func triggerPrimaryAction(for unit: AppWordUnit) {
        if !unit.inVocabulary {
            addWordUnitToLexicon(unit)
            return
        }
        if !unit.mastered {
            markWordUnitAsLearned(unit)
            return
        }
        statusText = "该词已学会：\(unit.normalizedToken)"
    }

    func handleWordUnitHover(_ unit: AppWordUnit, entered: Bool) {
        guard entered else {
            lastHoverUITriggerAtByUnitID.removeValue(forKey: unit.id)
            return
        }
        let now = Date()
        if let last = lastHoverUITriggerAtByUnitID[unit.id],
           now.timeIntervalSince(last) < 0.2 {
            return
        }
        lastHoverUITriggerAtByUnitID[unit.id] = now
        let trigger = WordInteractionTrigger(
            type: .hover,
            token: unit.normalizedToken,
            appName: unit.appName,
            appBundleID: unit.appBundleID,
            happenedAt: now
        )
        handleWordInteractionTrigger(trigger, unit: unit)
    }

    func handleWordUnitTap(_ unit: AppWordUnit) {
        speakWordUnit(unit)
        guard unit.inVocabulary else {
            statusText = "已朗读：\(unit.normalizedToken)（新词未入库，不计次）"
            return
        }
        recordWordUnitLookup(unit, source: "词单元点击", silent: true)
        let count = readLookupCountSilently(for: unit.normalizedToken)
        statusText = "已朗读并计次：\(unit.normalizedToken)（\(count)）"
    }

    func addWordUnitToLexicon(_ unit: AppWordUnit) {
        let lemma = unit.normalizedToken
        if vocabularyKeys.contains(lemma) {
            if !specialMarkedWords.contains(lemma) {
                guard let store else {
                    statusText = "该词已在词库，但数据库不可用，无法标记：\(lemma)"
                    return
                }
                do {
                    try store.setSpecialMarked(word: lemma, marked: true)
                    specialMarkedWords.insert(lemma)
                    specialMarkedCount = specialMarkedWords.count
                    specialMarkedWordsPreview = specialMarkedWords.sorted()
                    statusText = "该词已在词库，已添加特殊标记：\(lemma)"
                } catch {
                    statusText = "标记失败：\(error.localizedDescription)"
                }
            } else {
                statusText = "该词已在词库：\(lemma)"
            }
            refreshScannedWordUnits()
            return
        }

        autoAddWordFromMissCandidate(lemma)
    }

    func markWordUnitAsLearned(_ unit: AppWordUnit) {
        let lemma = unit.normalizedToken
        guard vocabularyKeys.contains(lemma) else {
            statusText = "学会失败：\(lemma) 不在词库"
            return
        }

        engine.markMastered(lemma)
        do {
            try store?.setMastered(word: lemma, mastered: true)
            masteredWords.insert(lemma)
            if lookupResult?.lemma == lemma {
                lookupResult = nil
                currentResultSpecialMarked = false
            }
            statusText = "已标记掌握：\(lemma)"
            refreshScannedWordUnits()
        } catch {
            statusText = "学会状态保存失败：\(error.localizedDescription)"
        }
    }

    func speakWordUnit(_ unit: AppWordUnit) {
        speechService.speakEnglishWord(unit.normalizedToken)
        statusText = "已朗读：\(unit.normalizedToken)"
    }

    func recordWordUnitLookup(_ unit: AppWordUnit, source: String = "词单元面板", silent: Bool = false) {
        guard vocabularyKeys.contains(unit.normalizedToken) else {
            if !silent {
                statusText = "计数失败：\(unit.normalizedToken) 不在词库"
            }
            return
        }
        guard let store else {
            if !silent {
                statusText = "计数失败：数据库不可用"
            }
            return
        }

        do {
            try store.recordLookup(
                lemma: unit.normalizedToken,
                observedToken: unit.rawToken,
                source: source,
                appBundleID: unit.appBundleID,
                appName: unit.appName
            )
            refreshStats()
            refreshScannedWordUnits()
            if !silent {
                statusText = "已记录查询：\(unit.normalizedToken)"
            }
        } catch {
            if !silent {
                statusText = "计数失败：\(error.localizedDescription)"
            }
        }
    }

    func handleServiceAdd(
        text: String,
        sourceAppBundleID: String = "unknown.bundle",
        sourceAppName: String = "未知应用"
    ) {
        let source = "右键服务-加词"
        let hit = applyCapturedTextAndLookup(
            text: text,
            source: source,
            appBundleID: sourceAppBundleID,
            appName: sourceAppName
        )
        applyWordUnitScan(
            capture: SelectionCaptureResult(
                text: text,
                source: source,
                appName: sourceAppName,
                appBundleID: sourceAppBundleID
            ),
            updateStatus: false
        )
        resetHoverPreviewState()
        if hit {
            ensureSpecialMarkForCurrentWord()
            return
        }

        let diagnostics = analyzeInput(text)
        guard let candidateWord = diagnostics.tokens.first else {
            statusText = "服务加词失败：未检测到英文词元"
            return
        }
        autoAddWordFromMissCandidate(candidateWord)
    }

    func handleServiceLearn(
        text: String,
        sourceAppBundleID: String = "unknown.bundle",
        sourceAppName: String = "未知应用"
    ) {
        let source = "右键服务-学会"
        let hit = applyCapturedTextAndLookup(
            text: text,
            source: source,
            appBundleID: sourceAppBundleID,
            appName: sourceAppName
        )
        applyWordUnitScan(
            capture: SelectionCaptureResult(
                text: text,
                source: source,
                appName: sourceAppName,
                appBundleID: sourceAppBundleID
            ),
            updateStatus: false
        )
        resetHoverPreviewState()
        guard hit else {
            statusText = "服务学会失败：当前选词未命中词库"
            return
        }
        markCurrentAsMastered()
        overlayService.hide()
    }

    func addCustomWord() {
        guard let normalized = WordNormalizer.normalizeToken(customWordText) else {
            statusText = "自定义词添加失败：请输入英文单词"
            return
        }

        let definition = customDefinitionText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !definition.isEmpty else {
            statusText = "自定义词添加失败：释义不能为空"
            return
        }

        engine.upsertWord(normalized, definition: definition)
        vocabularyKeys.insert(normalized)
        vocabularySize = engine.vocabularySize

        do {
            try store?.upsertCustomWord(word: normalized, definition: definition)
            statusText = "已添加自定义词：\(normalized)"
            customWordText = ""
            customDefinitionText = ""
            customPhoneticText = ""
            customAudioURLText = ""
            refreshScannedWordUnits()
        } catch {
            statusText = "自定义词保存失败：\(error.localizedDescription)"
        }
    }

    func autoFillCustomWordDefinitionAndPronunciation() {
        let seed = customWordText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? inputText
            : customWordText

        guard !customAutoFillLoading else {
            return
        }

        customAutoFillLoading = true
        statusText = "正在自动补全释义与发音..."

        Task {
            do {
                let result = try await autoFillService.fetch(word: seed)
                await MainActor.run {
                    self.customWordText = result.word
                    self.customDefinitionText = result.definition
                    self.customPhoneticText = result.phonetic ?? ""
                    self.customAudioURLText = result.audioURL?.absoluteString ?? ""
                    self.speechService.speakEnglishWord(result.word, audioURL: result.audioURL)
                    self.customAutoFillLoading = false
                    if let phonetic = result.phonetic, !phonetic.isEmpty {
                        self.statusText = "自动补全成功：\(result.word) \(phonetic)"
                    } else {
                        self.statusText = "自动补全成功：\(result.word)"
                    }
                }
            } catch {
                await MainActor.run {
                    self.customAutoFillLoading = false
                    self.statusText = "自动补全失败：\(error.localizedDescription)"
                }
            }
        }
    }

    func speakCustomWordPreview() {
        guard let normalized = WordNormalizer.normalizeToken(customWordText) else {
            statusText = "没有可朗读的新词"
            return
        }
        let audioURL = URL(string: customAudioURLText)
        speechService.speakEnglishWord(normalized, audioURL: audioURL)
        statusText = "已朗读：\(normalized)"
    }

    func markCurrentAsMastered() {
        guard let lemma = lookupResult?.lemma else {
            statusText = "没有可标记的词"
            return
        }

        engine.markMastered(lemma)
        do {
            try store?.setMastered(word: lemma, mastered: true)
            statusText = "已标记掌握：\(lemma)"
            masteredWords.insert(lemma)
            lookupResult = nil
            currentResultSpecialMarked = false
            refreshScannedWordUnits()
        } catch {
            statusText = "掌握状态保存失败：\(error.localizedDescription)"
        }
    }

    func speakCurrentWord() {
        guard let result = lookupResult else {
            statusText = "没有可朗读的词"
            return
        }
        speechService.speakEnglishWord(result.lemma)
        statusText = "已朗读：\(result.lemma)"
    }

    func toggleSpecialMarkForCurrentWord() {
        guard let lemma = lookupResult?.lemma else {
            statusText = "没有可标记的词"
            return
        }
        guard let store else {
            statusText = "标记失败：数据库不可用"
            return
        }

        let willMark = !specialMarkedWords.contains(lemma)
        do {
            try store.setSpecialMarked(word: lemma, marked: willMark)
            if willMark {
                specialMarkedWords.insert(lemma)
                statusText = "已添加特殊标记：\(lemma)"
            } else {
                specialMarkedWords.remove(lemma)
                statusText = "已取消特殊标记：\(lemma)"
            }
            currentResultSpecialMarked = willMark
            specialMarkedCount = specialMarkedWords.count
            specialMarkedWordsPreview = specialMarkedWords.sorted()
            refreshScannedWordUnits()
        } catch {
            statusText = "特殊标记保存失败：\(error.localizedDescription)"
        }
    }

    private func ensureSpecialMarkForCurrentWord() {
        guard let lemma = lookupResult?.lemma else {
            statusText = "没有可标记的词"
            return
        }
        guard let store else {
            statusText = "标记失败：数据库不可用"
            return
        }

        if specialMarkedWords.contains(lemma) {
            statusText = "该词已是特殊标记：\(lemma)"
            return
        }

        do {
            try store.setSpecialMarked(word: lemma, marked: true)
            specialMarkedWords.insert(lemma)
            specialMarkedCount = specialMarkedWords.count
            specialMarkedWordsPreview = specialMarkedWords.sorted()
            currentResultSpecialMarked = true
            statusText = "已添加特殊标记：\(lemma)"
            overlayService.hide()
            refreshScannedWordUnits()
        } catch {
            statusText = "特殊标记保存失败：\(error.localizedDescription)"
        }
    }

    private func autoAddWordFromMissCandidate(_ candidateWord: String) {
        guard !customAutoFillLoading else {
            return
        }

        customAutoFillLoading = true
        statusText = "正在自动加入词库：\(candidateWord)"

        Task {
            do {
                let result = try await autoFillService.fetch(word: candidateWord)
                await MainActor.run {
                    self.engine.upsertWord(result.word, definition: result.definition)
                    self.vocabularyKeys.insert(result.word)
                    self.vocabularySize = self.engine.vocabularySize

                    do {
                        try self.store?.upsertCustomWord(word: result.word, definition: result.definition)
                    } catch {
                        self.statusText = "词库保存失败：\(error.localizedDescription)"
                        self.customAutoFillLoading = false
                        return
                    }

                    self.customWordText = result.word
                    self.customDefinitionText = result.definition
                    self.customPhoneticText = result.phonetic ?? ""
                    self.customAudioURLText = result.audioURL?.absoluteString ?? ""
                    self.speechService.speakEnglishWord(result.word, audioURL: result.audioURL)
                    self.customAutoFillLoading = false
                    self.statusText = "已自动加入词库：\(result.word)"
                    self.overlayService.hide()
                    self.refreshScannedWordUnits()
                }
            } catch {
                await MainActor.run {
                    self.customAutoFillLoading = false
                    self.statusText = "自动加入失败：\(error.localizedDescription)"
                }
            }
        }
    }

    func displayWordWithMark(_ word: String) -> String {
        specialMarkedWords.contains(word) ? "★ \(word)" : word
    }

    func fillCustomWordFromDiagnosticsCandidate() {
        let tokens = WordNormalizer.extractTokens(inputText)
        guard let first = tokens.first else {
            statusText = "没有可填入的候选词元"
            return
        }
        customWordText = first
        if customDefinitionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            customDefinitionText = ""
        }
        statusText = "已填入候选词元：\(first)，正在自动补全释义与发音"
        autoFillCustomWordDefinitionAndPronunciation()
    }

    func applyPreferredWindowHeight() {
        let targetHeight = CGFloat(preferredWindowHeight)
        guard let window = mainContentWindow() else {
            statusText = "窗口调整失败：未找到可见窗口"
            return
        }

        var frame = window.frame
        let delta = targetHeight - frame.height
        frame.size.height = targetHeight
        frame.origin.y -= delta
        window.setFrame(frame, display: true, animate: true)
        statusText = "已调整窗口高度：\(Int(targetHeight))"
    }

    func applyRecommendedWindowHeight() {
        preferredWindowHeight = 1080
        applyPreferredWindowHeight()
    }

    func activateMainWindowForInput() {
        _ = NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        NSApp.activate(ignoringOtherApps: true)
        NSApp.unhide(nil)

        guard let window = mainContentWindow() else {
            statusText = "未找到可见窗口，请先打开应用主窗口"
            return
        }

        window.makeKeyAndOrderFront(nil)
        window.makeMain()
        window.orderFrontRegardless()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            window.makeKeyAndOrderFront(nil)
            window.makeMain()
        }
        statusText = "已激活本窗口，可继续输入"
    }

    func exportStatisticsCSV() {
        guard let store else {
            statusText = "导出失败：数据库不可用"
            return
        }
        do {
            let rows = try store.topWords(limit: 5000)
            let total = try store.totalLookupCount()
            let url = try exportService.exportTopWordsCSV(rows: rows, totalLookups: total)
            statusText = "导出成功：\(url.path)"
        } catch {
            statusText = "导出失败：\(error.localizedDescription)"
        }
    }

    func exportBackupJSON() {
        guard let store else {
            statusText = "备份失败：数据库不可用"
            return
        }
        do {
            let snapshot = BackupSnapshot(
                exportedAt: ISO8601DateFormatter().string(from: Date()),
                lookupCounts: try store.allLookupCounts(),
                customWords: try store.loadCustomVocabulary(),
                masteredWords: Array(try store.loadMasteredWords()).sorted(),
                specialMarkedWords: Array(try store.loadSpecialMarkedWords()).sorted()
            )
            let url = try backupService.exportBackup(snapshot: snapshot)
            statusText = "备份成功：\(url.path)"
        } catch {
            statusText = "备份失败：\(error.localizedDescription)"
        }
    }

    func importLatestBackupJSON() {
        guard let store else {
            statusText = "导入失败：数据库不可用"
            return
        }
        do {
            let snapshot = try backupService.loadLatestBackup()
            try store.mergeLookupCounts(snapshot.lookupCounts)
            try store.mergeCustomVocabulary(snapshot.customWords)
            try store.mergeMasteredWords(Set(snapshot.masteredWords))
            try store.mergeSpecialMarkedWords(Set(snapshot.specialMarkedWords))

            for (word, definition) in snapshot.customWords {
                engine.upsertWord(word, definition: definition)
                vocabularyKeys.insert(word)
            }
            for word in snapshot.masteredWords {
                engine.markMastered(word)
                masteredWords.insert(word)
            }
            for word in snapshot.specialMarkedWords {
                specialMarkedWords.insert(word)
            }
            specialMarkedCount = specialMarkedWords.count
            specialMarkedWordsPreview = specialMarkedWords.sorted()
            vocabularySize = engine.vocabularySize
            refreshStats()
            refreshScannedWordUnits()
            statusText = "导入成功：合并最新备份（\(snapshot.exportedAt)）"
        } catch {
            statusText = "导入失败：\(error.localizedDescription)"
        }
    }

    private func persistLookup(source: String) -> Int? {
        guard let result = lookupResult else {
            return nil
        }
        guard let store else {
            statusText = "已命中，但本地数据库不可用"
            return nil
        }

        if lastLookupAppBundleID == "unknown.bundle" {
            lastLookupAppBundleID = currentFrontmostBundleID()
            lastLookupAppName = currentFrontmostAppName()
        }

        do {
            try store.recordLookup(
                lemma: result.lemma,
                observedToken: result.observedToken,
                source: source,
                appBundleID: lastLookupAppBundleID,
                appName: lastLookupAppName
            )
            refreshStats()
            refreshScannedWordUnits()
            return try store.lookupCount(word: result.lemma)
        } catch {
            statusText = "记录失败：\(error.localizedDescription)"
            return nil
        }
    }

    @discardableResult
    private func applyCapturedTextAndLookup(
        text: String,
        source: String,
        appBundleID: String = "unknown.bundle",
        appName: String = "未知应用"
    ) -> Bool {
        lastLookupAppBundleID = appBundleID
        lastLookupAppName = appName
        inputText = text
        lastSelectionSource = source
        lastCapturedPreview = Self.makePreview(text)
        let hit = lookup(source: source)
        appendCaptureLog(source: source, text: text, hit: hit)
        return hit
    }

    private func readLookupCount(for word: String) -> Int? {
        guard let store else {
            return nil
        }
        do {
            return try store.lookupCount(word: word)
        } catch {
            statusText = "查询次数读取失败：\(error.localizedDescription)"
            return nil
        }
    }

    private func refreshStats() {
        guard let store else {
            totalLookups = 0
            topWords = []
            sourceStats = []
            recentEvents = []
            panelSourceTotalCount = 0
            hoverSourceTotalCount = 0
            tapSourceTotalCount = 0
            panelSourceLastEventAt = "无"
            hoverSourceLastEventAt = "无"
            tapSourceLastEventAt = "无"
            return
        }

        do {
            totalLookups = try store.totalLookupCount()
            switch topWordsSortMode {
            case .countDesc:
                topWords = try store.topWords(limit: 8)
            case .recentDesc:
                topWords = try store.topWordsByRecent(limit: 8)
            }
            sourceStats = try store.sourceFrequencies(limit: 6)
            recentEvents = try store.recentLookupEvents(limit: 6)
            panelSourceTotalCount = try store.lookupEventCount(source: "词单元面板")
            hoverSourceTotalCount = try store.lookupEventCount(source: "词单元悬停")
            tapSourceTotalCount = try store.lookupEventCount(source: "词单元点击")
            panelSourceLastEventAt = Self.displayTime(try store.latestLookupEventCreatedAt(source: "词单元面板"))
            hoverSourceLastEventAt = Self.displayTime(try store.latestLookupEventCreatedAt(source: "词单元悬停"))
            tapSourceLastEventAt = Self.displayTime(try store.latestLookupEventCreatedAt(source: "词单元点击"))
        } catch {
            statusText = "统计读取失败：\(error.localizedDescription)"
            totalLookups = 0
            topWords = []
            sourceStats = []
            recentEvents = []
            panelSourceTotalCount = 0
            hoverSourceTotalCount = 0
            tapSourceTotalCount = 0
            panelSourceLastEventAt = "无"
            hoverSourceLastEventAt = "无"
            tapSourceLastEventAt = "无"
        }
    }

    private func applyWordUnitScan(capture: SelectionCaptureResult, updateStatus: Bool) {
        let normalizedTextForSignature = capture.text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let scanSignature = "\(capture.appBundleID)|\(normalizedTextForSignature)"

        if wordUnitDebounceEnabled,
           let lastSignature = lastWordUnitScanSignature,
           let lastAt = lastWordUnitScanAt,
           lastSignature == scanSignature,
           Date().timeIntervalSince(lastAt) < wordUnitDebounceSeconds {
            if updateStatus {
                statusText = "词单元扫描已去抖：与最近一次结果相同"
            }
            return
        }

        lastWordUnitScanSignature = scanSignature
        lastWordUnitScanAt = Date()

        lastWordUnitCaptureText = capture.text
        lastWordUnitContext = capture
        wordUnitAppName = capture.appName
        wordUnitAppBundleID = capture.appBundleID
        wordUnitCaptureSource = capture.source
        wordUnitCapturedAt = Self.nowTimeString()
        wordUnitScanPreview = Self.makePreview(capture.text, maxCount: 120)

        let inScope = isFocusTargetApp(name: capture.appName, bundleID: capture.appBundleID)
        let bypassed = shouldBypassFocusScopeFilter(context: capture)
        if wordUnitFocusAppsOnly, !inScope, !bypassed {
            wordUnitScopeEvaluationText = "范围判定：未命中目标应用（已拦截）"
            let allTokens = WordNormalizer.extractTokens(capture.text)
            rawWordTokenCount = allTokens.count
            filteredWordTokenCount = allTokens.count
            scannedWordUnits = []
            wordUnitIgnoredOutOfScopeCount = allTokens.count
            wordUnitFilteredByLengthCount = 0
            wordUnitFilteredByCharacterCount = 0
            wordUnitFilteredByStopWordCount = 0
            wordUnitFilteredByDuplicateCount = 0
            wordUnitFilteredByMasteredCount = 0
            if updateStatus {
                statusText = "当前应用不在目标范围（Codex/Obsidian/VSCode），已跳过"
            }
            return
        }
        if wordUnitFocusAppsOnly {
            wordUnitScopeEvaluationText = inScope
                ? "范围判定：命中目标应用"
                : "范围判定：来源识别兜底放行（自动复制/剪贴板）"
        } else {
            wordUnitScopeEvaluationText = "范围判定：已关闭目标应用限制"
        }

        refreshScannedWordUnits()
        if updateStatus {
            statusText = "词单元扫描完成：\(scannedWordUnits.count) 个（原始 \(rawWordTokenCount)，过滤 \(filteredWordTokenCount)）"
        }
    }

    private func refreshScannedWordUnits() {
        guard let context = lastWordUnitContext else {
            scannedWordUnits = []
            rawWordTokenCount = 0
            filteredWordTokenCount = 0
            wordUnitFilteredByLengthCount = 0
            wordUnitFilteredByCharacterCount = 0
            wordUnitFilteredByStopWordCount = 0
            wordUnitFilteredByDuplicateCount = 0
            wordUnitFilteredByMasteredCount = 0
            wordUnitIgnoredOutOfScopeCount = 0
            return
        }

        let inScope = isFocusTargetApp(name: context.appName, bundleID: context.appBundleID)
        let bypassed = shouldBypassFocusScopeFilter(context: context)
        if wordUnitFocusAppsOnly, !inScope, !bypassed {
            wordUnitScopeEvaluationText = "范围判定：未命中目标应用（已拦截）"
            let allTokens = WordNormalizer.extractTokens(lastWordUnitCaptureText)
            rawWordTokenCount = allTokens.count
            filteredWordTokenCount = allTokens.count
            scannedWordUnits = []
            wordUnitIgnoredOutOfScopeCount = allTokens.count
            wordUnitFilteredByLengthCount = 0
            wordUnitFilteredByCharacterCount = 0
            wordUnitFilteredByStopWordCount = 0
            wordUnitFilteredByDuplicateCount = 0
            wordUnitFilteredByMasteredCount = 0
            return
        }
        if wordUnitFocusAppsOnly {
            wordUnitScopeEvaluationText = inScope
                ? "范围判定：命中目标应用"
                : "范围判定：来源识别兜底放行（自动复制/剪贴板）"
        } else {
            wordUnitScopeEvaluationText = "范围判定：已关闭目标应用限制"
        }

        let rawTokens = WordNormalizer.extractTokens(lastWordUnitCaptureText)
        rawWordTokenCount = rawTokens.count
        var filteredCount = 0
        var filteredByLength = 0
        var filteredByCharacter = 0
        var filteredByStopWord = 0
        var filteredByDuplicate = 0
        var seen = Set<String>()
        var units: [AppWordUnit] = []

        for token in rawTokens {
            let normalized = token.lowercased()
            if normalized.count < wordUnitMinTokenLength || normalized.count > 32 {
                filteredByLength += 1
                filteredCount += 1
                continue
            }
            guard normalized.unicodeScalars.allSatisfy({ CharacterSet.letters.contains($0) }) else {
                filteredByCharacter += 1
                filteredCount += 1
                continue
            }
            if wordUnitStopWordsFilterEnabled, Self.noiseStopWords.contains(normalized) {
                filteredByStopWord += 1
                filteredCount += 1
                continue
            }
            guard seen.insert(normalized).inserted else {
                filteredByDuplicate += 1
                filteredCount += 1
                continue
            }

            let lemma = WordNormalizer.resolveLemma(for: normalized, vocabularyKeys: vocabularyKeys) ?? normalized
            let count = readLookupCountSilently(for: lemma)
            units.append(
                AppWordUnit(
                    id: "\(context.appBundleID)|\(lemma)",
                    rawToken: token,
                    normalizedToken: lemma,
                    appName: context.appName,
                    appBundleID: context.appBundleID,
                    captureSource: context.source,
                    capturedAt: wordUnitCapturedAt,
                    lookupCount: count,
                    inVocabulary: vocabularyKeys.contains(lemma),
                    mastered: masteredWords.contains(lemma),
                    specialMarked: specialMarkedWords.contains(lemma)
                )
            )
        }

        filteredWordTokenCount = filteredCount
        wordUnitFilteredByLengthCount = filteredByLength
        wordUnitFilteredByCharacterCount = filteredByCharacter
        wordUnitFilteredByStopWordCount = filteredByStopWord
        wordUnitFilteredByDuplicateCount = filteredByDuplicate
        wordUnitIgnoredOutOfScopeCount = 0
        wordUnitFilteredByMasteredCount = wordUnitOnlyActionable
            ? (shouldKeepMasteredVisibleInCurrentContext ? 0 : units.filter { $0.mastered }.count)
            : 0
        scannedWordUnits = units.sorted { lhs, rhs in
            let l = priority(of: lhs)
            let r = priority(of: rhs)
            if l != r {
                return l < r
            }
            if lhs.lookupCount != rhs.lookupCount {
                return lhs.lookupCount > rhs.lookupCount
            }
            return lhs.normalizedToken < rhs.normalizedToken
        }

        // Avoid stale hover preview from previous scans when the word is no longer visible.
        if !visibleScannedWordUnits.contains(where: { $0.normalizedToken == hoverLastWord }) {
            resetHoverPreviewState()
        }
    }

    private func resetHoverPreviewState() {
        hoverLastWord = "无"
        hoverPreviewDefinition = "无"
        hoverPreviewCount = 0
        hoverTriggeredCount = 0
        hoverLastStatus = "未触发"
        lastHoverUITriggerAtByUnitID.removeAll(keepingCapacity: false)
    }

    private func priority(of unit: AppWordUnit) -> Int {
        if !unit.inVocabulary {
            return 0
        }
        if unit.mastered {
            return 2
        }
        return 1
    }

    private func handleWordInteractionTrigger(_ trigger: WordInteractionTrigger, unit: AppWordUnit) {
        switch trigger.type {
        case .hover:
            hoverLastWord = trigger.token
            hoverTriggeredCount += 1
            hoverPreviewDefinition = engine.definition(for: trigger.token) ?? "未入库"
            hoverPreviewCount = readLookupCountSilently(for: trigger.token)
            guard hoverCountEnabled else {
                hoverLastStatus = "已触发（计次关闭）"
                return
            }
            guard unit.inVocabulary else {
                hoverLastStatus = "已触发（新词不计次）"
                return
            }
            if let last = lastHoverCountAtByWord[trigger.token],
               trigger.happenedAt.timeIntervalSince(last) < hoverCountDebounceSeconds {
                hoverLastStatus = "已触发（去抖拦截）"
                return
            }
            lastHoverCountAtByWord[trigger.token] = trigger.happenedAt
            recordWordUnitLookup(unit, source: "词单元悬停", silent: true)
            hoverPreviewCount = readLookupCountSilently(for: trigger.token)
            hoverLastStatus = unit.mastered ? "已触发（已学会，已计次）" : "已触发（已计次）"
        case .panelAction, .hotkey, .service:
            break
        }
    }

    private func isFocusTargetApp(name: String, bundleID: String) -> Bool {
        let lowerName = name.lowercased()
        if lowerName.contains("codex") || lowerName.contains("obsidian") {
            return true
        }
        if lowerName.contains("visual studio code") || lowerName == "vscode" || lowerName == "code" {
            return true
        }
        let lowerBundle = bundleID.lowercased()
        return Self.focusTargetBundleIDs.contains(lowerBundle)
    }

    private func shouldBypassFocusScopeFilter(context: SelectionCaptureResult) -> Bool {
        guard isSelfApp(name: context.appName, bundleID: context.appBundleID) else {
            return false
        }
        // Manual panel-triggered scans can lose external app identity.
        // In this case, avoid false negatives from strict scope filtering.
        return context.source.contains("自动复制") || context.source.contains("剪贴板")
    }

    private func isSelfApp(name: String, bundleID: String) -> Bool {
        let lowerBundle = bundleID.lowercased()
        if lowerBundle == Self.selfAppBundleID || lowerBundle.contains("wordentropy") {
            return true
        }
        let lowerName = name.lowercased()
        return lowerName.contains("wordentropy") || name.contains("词库熵减")
    }

    private func readLookupCountSilently(for word: String) -> Int {
        guard let store else {
            return 0
        }
        do {
            return try store.lookupCount(word: word)
        } catch {
            return 0
        }
    }

    private func currentFrontmostAppName() -> String {
        NSWorkspace.shared.frontmostApplication?.localizedName ?? "未知应用"
    }

    private func currentFrontmostBundleID() -> String {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "unknown.bundle"
    }

    private static let noiseStopWords: Set<String> = [
        "a", "an", "the", "to", "of", "in", "on", "for", "at", "by",
        "and", "or", "if", "is", "are", "was", "were", "be", "been", "being",
        "this", "that", "these", "those", "it", "its", "as", "from", "with", "without",
    ]

    private static let focusTargetBundleIDs: Set<String> = [
        "md.obsidian",
        "com.microsoft.vscode",
        "com.microsoft.vscodeinsiders",
        "com.openai.codex",
        "com.openai.chatgpt",
    ]

    private static let selfAppBundleID = "com.zj16.wordentropy"
    private static let vocabularyFilename = "vocabulary.json"
    private static let packagedResourceBundleName = "WordEntropyApp_WordEntropyApp.bundle"

    private static func loadTopWordsSortModeFromDefaults() -> TopWordsSortMode {
        let raw = UserDefaults.standard.string(forKey: topWordsSortModeDefaultsKey) ?? TopWordsSortMode.countDesc.rawValue
        return TopWordsSortMode(rawValue: raw) ?? .countDesc
    }

    private static func loadBoolDefaults(key: String, fallback: Bool) -> Bool {
        if UserDefaults.standard.object(forKey: key) == nil {
            return fallback
        }
        return UserDefaults.standard.bool(forKey: key)
    }

    private static func loadIntDefaults(key: String, fallback: Int) -> Int {
        if UserDefaults.standard.object(forKey: key) == nil {
            return fallback
        }
        return UserDefaults.standard.integer(forKey: key)
    }

    private static func loadDoubleDefaults(key: String, fallback: Double) -> Double {
        if UserDefaults.standard.object(forKey: key) == nil {
            return fallback
        }
        return UserDefaults.standard.double(forKey: key)
    }

    private static func loadVocabularyFromResources() throws -> [String: String] {
        let candidates = vocabularyResourceCandidates()
        guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw VocabularyError.missingBundleResource(candidates.map(\.path))
        }
        let data = try Data(contentsOf: url)
        return try VocabularyLoader.loadJSON(data: data)
    }

    private static func vocabularyResourceCandidates() -> [URL] {
        var candidates: [URL] = []
        var seenPaths: Set<String> = []

        func appendCandidate(_ url: URL?) {
            guard let url else { return }
            let standardized = url.standardizedFileURL
            if seenPaths.insert(standardized.path).inserted {
                candidates.append(standardized)
            }
        }

        func appendPaths(base: URL) {
            appendCandidate(base.appendingPathComponent(vocabularyFilename))
            appendCandidate(
                base
                    .appendingPathComponent(packagedResourceBundleName, isDirectory: true)
                    .appendingPathComponent(vocabularyFilename)
            )
        }

        // Avoid Bundle.module here: the SPM-generated accessor can assert during app launch
        // when the resource bundle lives in Contents/Resources inside a packaged .app.
        if let resourceURL = Bundle.main.resourceURL {
            appendPaths(base: resourceURL)
        }

        let bundleURL = Bundle.main.bundleURL
        appendPaths(base: bundleURL)
        appendPaths(base: bundleURL.appendingPathComponent("Contents/Resources", isDirectory: true))

        if let executableDirectory = Bundle.main.executableURL?.deletingLastPathComponent() {
            appendPaths(base: executableDirectory)
            appendPaths(base: executableDirectory.deletingLastPathComponent())
            appendPaths(
                base: executableDirectory
                    .deletingLastPathComponent()
                    .appendingPathComponent("Resources", isDirectory: true)
            )
        }

        appendCandidate(
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
                .appendingPathComponent("Sources/WordEntropyApp/Resources", isDirectory: true)
                .appendingPathComponent(vocabularyFilename)
        )

        return candidates
    }

    private static func makeLookupStore() throws -> SQLiteLookupStore {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        guard let dir = appSupport.first else {
            throw VocabularyError.missingApplicationSupportDirectory
        }
        let dbURL = dir
            .appendingPathComponent("WordEntropy", isDirectory: true)
            .appendingPathComponent("word_entropy.sqlite3")
        return try SQLiteLookupStore(databaseURL: dbURL)
    }

    private func setupGlobalHotkey() {
        stopAllHotkeys()

        let primary = UInt32(cmdKey | shiftKey)
        let backup = UInt32(cmdKey | optionKey)
        var installedLabels: [String] = []
        var fallbackMessages: [String] = []

        func install(
            id: UInt32,
            keyCode: UInt32,
            name: String,
            primaryLabel: String,
            fallbackLabel: String,
            handler: @escaping @Sendable () -> Void
        ) {
            do {
                let service = GlobalHotkeyService(hotKeyID: id, keyCode: keyCode, modifiers: primary, handler: handler)
                try service.start()
                hotkeyServices.append(service)
                installedLabels.append("\(name) \(primaryLabel)")
            } catch {
                do {
                    let service = GlobalHotkeyService(hotKeyID: id, keyCode: keyCode, modifiers: backup, handler: handler)
                    try service.start()
                    hotkeyServices.append(service)
                    installedLabels.append("\(name) \(fallbackLabel)")
                    fallbackMessages.append("\(name) 使用备用快捷键")
                } catch {
                    fallbackMessages.append("\(name) 注册失败")
                }
            }
        }

        install(
            id: 1,
            keyCode: UInt32(kVK_ANSI_L),
            name: "查词",
            primaryLabel: "⌘⇧L",
            fallbackLabel: "⌘⌥L"
        ) { [weak self] in
            Task { @MainActor in
                self?.handleLookupHotkeyTriggered()
            }
        }

        install(
            id: 2,
            keyCode: UInt32(kVK_ANSI_A),
            name: "加词",
            primaryLabel: "⌘⇧A",
            fallbackLabel: "⌘⌥A"
        ) { [weak self] in
            Task { @MainActor in
                self?.handleQuickAddHotkeyTriggered()
            }
        }

        install(
            id: 3,
            keyCode: UInt32(kVK_ANSI_M),
            name: "学会",
            primaryLabel: "⌘⇧M",
            fallbackLabel: "⌘⌥M"
        ) { [weak self] in
            Task { @MainActor in
                self?.handleQuickLearnHotkeyTriggered()
            }
        }

        if installedLabels.isEmpty {
            hotkeyStatus = "初始化失败"
            statusText = "快捷键初始化失败：无可用快捷键"
            return
        }

        hotkeyStatus = installedLabels.joined(separator: " | ")
        if !fallbackMessages.isEmpty {
            statusText = fallbackMessages.joined(separator: "；")
        }
    }

    func retryHotkeyRegistration() {
        stopAllHotkeys()
        setupGlobalHotkey()
    }

    private func stopAllHotkeys() {
        for service in hotkeyServices {
            service.stop()
        }
        hotkeyServices.removeAll()
    }

    private func handleLookupHotkeyTriggered() {
        hotkeyLastTriggeredAt = Self.nowTimeString()
        statusText = "收到快捷键触发，正在采集选中文本..."
        lookupFromSelectionContext()
    }

    private func handleQuickAddHotkeyTriggered() {
        hotkeyLastTriggeredAt = Self.nowTimeString()
        statusText = "收到快捷加词触发，正在采集选中文本..."

        do {
            let capture = try selectionCaptureService.capturePreferredSelection()
            let hit = applyCapturedTextAndLookup(
                text: capture.text,
                source: "快捷加词-\(capture.source)",
                appBundleID: capture.appBundleID,
                appName: capture.appName
            )
            applyWordUnitScan(
                capture: SelectionCaptureResult(
                    text: capture.text,
                    source: "快捷加词-\(capture.source)",
                    appName: capture.appName,
                    appBundleID: capture.appBundleID
                ),
                updateStatus: false
            )

            if hit {
                ensureSpecialMarkForCurrentWord()
                return
            }

            let diagnostics = analyzeInput(capture.text)
            guard let candidateWord = diagnostics.tokens.first else {
                statusText = "快捷加词失败：未检测到英文词元"
                return
            }
            autoAddWordFromMissCandidate(candidateWord)
        } catch SelectionCaptureError.accessibilityPermissionDenied {
            _ = selectionCaptureService.requestAccessibilityPermissionPrompt()
            accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
            statusText = "快捷加词失败：请先授予辅助功能权限"
        } catch {
            statusText = "快捷加词失败：\(error.localizedDescription)"
        }
    }

    private func handleQuickLearnHotkeyTriggered() {
        hotkeyLastTriggeredAt = Self.nowTimeString()
        statusText = "收到快捷学会触发，正在采集选中文本..."

        do {
            let capture = try selectionCaptureService.capturePreferredSelection()
            let hit = applyCapturedTextAndLookup(
                text: capture.text,
                source: "快捷学会-\(capture.source)",
                appBundleID: capture.appBundleID,
                appName: capture.appName
            )
            applyWordUnitScan(
                capture: SelectionCaptureResult(
                    text: capture.text,
                    source: "快捷学会-\(capture.source)",
                    appName: capture.appName,
                    appBundleID: capture.appBundleID
                ),
                updateStatus: false
            )
            guard hit else {
                statusText = "快捷学会失败：当前选词未命中词库"
                return
            }
            markCurrentAsMastered()
            overlayService.hide()
        } catch SelectionCaptureError.accessibilityPermissionDenied {
            _ = selectionCaptureService.requestAccessibilityPermissionPrompt()
            accessibilityTrusted = selectionCaptureService.isAccessibilityTrusted()
            statusText = "快捷学会失败：请先授予辅助功能权限"
        } catch {
            statusText = "快捷学会失败：\(error.localizedDescription)"
        }
    }

    private static func nowTimeString() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: Date())
    }

    private static func displayTime(_ iso8601: String?) -> String {
        guard let iso8601, !iso8601.isEmpty else {
            return "无"
        }
        let parser = ISO8601DateFormatter()
        guard let date = parser.date(from: iso8601) else {
            return iso8601
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }

    private static func makePreview(_ text: String, maxCount: Int = 80) -> String {
        let collapsed = text
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if collapsed.count <= maxCount {
            return collapsed
        }
        let idx = collapsed.index(collapsed.startIndex, offsetBy: maxCount)
        return String(collapsed[..<idx]) + "..."
    }

    private func analyzeInput(_ text: String) -> LookupDiagnostics {
        let tokens = WordNormalizer.extractTokens(text)
        var matchedLemmas: [String] = []
        var seen = Set<String>()
        for token in tokens {
            guard let lemma = WordNormalizer.resolveLemma(for: token, vocabularyKeys: vocabularyKeys) else {
                continue
            }
            if seen.insert(lemma).inserted {
                matchedLemmas.append(lemma)
            }
        }
        return LookupDiagnostics(tokens: tokens, matchedLemmas: matchedLemmas, masteredWords: masteredWords)
    }

    private static func makeMissStatus(from diagnostics: LookupDiagnostics) -> String {
        guard !diagnostics.tokens.isEmpty else {
            return "未命中词库：未检测到英文词元"
        }
        if diagnostics.matchedLemmas.isEmpty {
            let prefix = diagnostics.tokens.prefix(5).joined(separator: ", ")
            return "未命中词库：候选词元[\(prefix)]不在词库"
        }

        let unresolved = diagnostics.matchedLemmas.filter { !diagnostics.masteredWords.contains($0) }
        if unresolved.isEmpty {
            let prefix = diagnostics.matchedLemmas.prefix(5).joined(separator: ", ")
            return "未命中词库：可命中词已标记掌握[\(prefix)]"
        }

        return "未命中词库：候选词元与词库存在偏差"
    }

    private func mainContentWindow() -> NSWindow? {
        if let visible = NSApp.windows.first(where: { $0.isVisible && !($0 is NSPanel) }) {
            return visible
        }
        if let anyMain = NSApp.windows.first(where: { !($0 is NSPanel) }) {
            return anyMain
        }
        return NSApp.keyWindow
    }

    private func appendCaptureLog(source: String, text: String, hit: Bool) {
        let entry = CaptureLogEntry(
            time: Self.nowTimeString(),
            source: source,
            preview: Self.makePreview(text, maxCount: 60),
            hit: hit
        )
        recentCaptures.insert(entry, at: 0)
        if recentCaptures.count > 8 {
            recentCaptures = Array(recentCaptures.prefix(8))
        }
    }
}

private struct LookupDiagnostics {
    let tokens: [String]
    let matchedLemmas: [String]
    let masteredWords: Set<String>

    var tokenPreview: String {
        if tokens.isEmpty {
            return "无"
        }
        return tokens.prefix(8).joined(separator: ", ")
    }

    var lemmaPreview: String {
        if matchedLemmas.isEmpty {
            return "无"
        }
        return matchedLemmas.prefix(8).joined(separator: ", ")
    }
}

enum VocabularyError: LocalizedError {
    case missingBundleResource([String])
    case missingApplicationSupportDirectory

    var errorDescription: String? {
        switch self {
        case .missingBundleResource(let candidates):
            let joined = candidates.prefix(8).joined(separator: "；")
            let suffix = candidates.count > 8 ? "；..." : ""
            return "未找到 bundled vocabulary.json，已检查：\(joined)\(suffix)"
        case .missingApplicationSupportDirectory:
            return "无法定位 Application Support 目录"
        }
    }
}
