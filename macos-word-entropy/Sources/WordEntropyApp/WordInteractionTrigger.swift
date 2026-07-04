import Foundation

enum WordInteractionTriggerType: String {
    case hover
    case panelAction
    case hotkey
    case service
}

struct WordInteractionTrigger {
    let type: WordInteractionTriggerType
    let token: String
    let appName: String
    let appBundleID: String
    let happenedAt: Date
}
