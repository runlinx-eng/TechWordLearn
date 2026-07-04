// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "WordEntropyApp",
    defaultLocalization: "en",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "WordEntropyCore",
            targets: ["WordEntropyCore"]
        ),
        .executable(
            name: "WordEntropyApp",
            targets: ["WordEntropyApp"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-testing.git", from: "0.9.0"),
    ],
    targets: [
        .target(
            name: "WordEntropyCore"
        ),
        .executableTarget(
            name: "WordEntropyApp",
            dependencies: ["WordEntropyCore"],
            exclude: [
                "Info.plist",
            ],
            resources: [
                .copy("Resources/vocabulary.json"),
            ]
        ),
        .testTarget(
            name: "WordEntropyCoreTests",
            dependencies: [
                "WordEntropyCore",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
    ]
)
