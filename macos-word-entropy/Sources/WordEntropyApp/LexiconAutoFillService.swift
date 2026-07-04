import Foundation
import WordEntropyCore

struct AutoLexiconResult {
    let word: String
    let definition: String
    let phonetic: String?
    let audioURL: URL?
}

enum AutoLexiconError: LocalizedError {
    case invalidWord
    case lookupFailed(statusCode: Int)
    case noDefinitionFound

    var errorDescription: String? {
        switch self {
        case .invalidWord:
            return "请输入可识别的英文单词"
        case .lookupFailed(let statusCode):
            return "词典查询失败（HTTP \(statusCode)）"
        case .noDefinitionFound:
            return "未找到可用释义"
        }
    }
}

struct LexiconAutoFillService: Sendable {
    func fetch(word raw: String) async throws -> AutoLexiconResult {
        guard let normalized = WordNormalizer.normalizeToken(raw) else {
            throw AutoLexiconError.invalidWord
        }

        let escaped = normalized.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? normalized
        guard let url = URL(string: "https://api.dictionaryapi.dev/api/v2/entries/en/\(escaped)") else {
            throw AutoLexiconError.invalidWord
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AutoLexiconError.lookupFailed(statusCode: -1)
        }
        guard http.statusCode == 200 else {
            throw AutoLexiconError.lookupFailed(statusCode: http.statusCode)
        }

        let entries = try JSONDecoder().decode([DictionaryAPIEntry].self, from: data)
        guard let entry = entries.first else {
            throw AutoLexiconError.noDefinitionFound
        }

        let definition = entry.meanings
            .flatMap { meaning in
                meaning.definitions.map { definition in
                    if let pos = meaning.partOfSpeech, !pos.isEmpty {
                        return "\(pos): \(definition.definition)"
                    }
                    return definition.definition
                }
            }
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

        guard let definition else {
            throw AutoLexiconError.noDefinitionFound
        }

        let phonetic = entry.phonetic ?? entry.phonetics.first(where: { ($0.text ?? "").isEmpty == false })?.text
        let audioURL = entry.phonetics
            .compactMap { item -> URL? in
                guard let audio = item.audio, !audio.isEmpty else {
                    return nil
                }
                return URL(string: audio)
            }
            .first

        return AutoLexiconResult(
            word: normalized,
            definition: definition,
            phonetic: phonetic,
            audioURL: audioURL
        )
    }
}

private struct DictionaryAPIEntry: Decodable {
    let phonetic: String?
    let phonetics: [DictionaryAPIPhonetic]
    let meanings: [DictionaryAPIMeaning]
}

private struct DictionaryAPIPhonetic: Decodable {
    let text: String?
    let audio: String?
}

private struct DictionaryAPIMeaning: Decodable {
    let partOfSpeech: String?
    let definitions: [DictionaryAPIDefinition]
}

private struct DictionaryAPIDefinition: Decodable {
    let definition: String
}
