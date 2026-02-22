# QA Compiler

PRD・Design Doc・テストコードを入力として、AIがリスク分析 → テスト計画 → テスト分析 → テスト設計を自動実行するCLIツール

## 使い方

QA Compilerは、あなたのプロダクトの**PRD・Design Doc・テストコード**を読み取り、AIでQAプロセスを実行します。プロダクトのリポジトリ内でも、QA専用ディレクトリでも動作します

### 1. QAワークフローを準備する

プロダクトのリポジトリ内に、QA用のファイルを追加します:

```
your-product/                      # プロダクト
├── src/                           # ソースコード（QA Compilerは触れない）
├── docs/                          # 既存のドキュメント
│   ├── prd.md                     # AIへの入力として使うprdファイル
│   └── design-doc.md              # AIへの入力として使うdesign-docファイル
│
│  ── 以下をQA用に追加 ──
├── qa-workflow.yaml               # ワークフロー定義（どの順でAIを実行するか）
└── schemas/                       # 各ステップの出力をJSON Schemaで制約
    ├── risk-analysis.json
    └── test-plan.json
```

### 2. ワークフローYAMLを書く

ワークフローYAMLで「どのドキュメントを入力とし、どの順番でAIに何をさせるか」を定義します。

```yaml
name: qa-standard-workflow
description: 標準QAワークフロー

# --- 入力: AIに読ませるドキュメント ---
inputs:
  - path: docs/prd.md            # YAMLファイルからの相対パス
    type: prd
    label: prd                   # テンプレートで {{inputs.prd}} として参照
  - path: docs/design-doc.md
    type: design-doc
    label: design                # {{inputs.design}} として参照

# --- ステップ: AIの実行順序を定義（DAGとして依存関係を解決） ---
steps:
  - id: risk-analysis
    name: Risk Analysis
    type: risk-analysis
    prompt_template: |
      PRDとDesign Docからリスクを分析してください。
      ## PRD
      {{inputs.prd}}
      ## Design Document
      {{inputs.design}}
    output_schema: schemas/risk-analysis.json

  - id: test-plan
    name: Test Plan
    type: test-plan
    depends_on:
      - risk-analysis            # risk-analysisの完了後に実行
    prompt_template: |
      リスク分析の結果に基づいてテスト計画を作成してください。
      ## リスク分析結果
      {{steps.risk-analysis.output}}
    output_schema: schemas/test-plan.json
```

**テンプレート変数:**
- `{{inputs.ラベル名}}` - 入力ドキュメントの内容を展開
- `{{steps.ステップID.output}}` - 先行ステップの出力を展開

### 3. バリデーション（任意）

ワークフロー定義の構文を検証します:

```bash
qa-compiler validate qa-workflow.yaml
```

検証項目: YAML構文、スキーマ準拠、DAG循環依存チェック、参照ファイルの存在確認

### 5. 実行

```bash
qa-compiler run qa-workflow.yaml
```

// 出力例
```
[1/4] リスク分析 ... done (85.1s)
[2/4] テスト計画 ... done (77.8s)
[3/4] テスト分析 ... done (81.9s)
[4/4] テスト設計 ... done (231.9s)
All steps completed successfully. (4/4)
```

### 6. 出力を確認する

ワークフローYAMLと同じディレクトリに `.output/` が生成されます:

```
.output/
├── execution-state.json        # ワークフロー全体の実行状態
├── risk-analysis/
│   ├── output.json             # JSON Schema準拠の構造化出力
│   └── reasoning.log           # AIの思考過程ログ
└── test-plan/
    ├── output.json
    └── reasoning.log
```

## CLIオプション

### `qa-compiler run`

```
qa-compiler run <workflow-file> [options]
```

| オプション | 短縮 | 説明 |
|-----------|------|------|
| `--resume` | `-r` | 前回の中断地点から再開 |
| `--output-dir <dir>` | `-o` | 出力ディレクトリ（デフォルト: `.output/`） |

終了コード: `0` 成功 / `1` バリデーションエラー / `2` ステップ実行エラー

### `qa-compiler validate`

```
qa-compiler validate <workflow-file>
```

終了コード: `0` バリデーション成功 / `1` バリデーション失敗

## 中断と再開

ステップが失敗した場合、完了済みステップの出力は保持される。`--resume` で中断地点から再開できる:

```bash
# 初回実行（step-3で失敗）
qa-compiler run qa-workflow.yaml

# 失敗原因を修正して再開（step-1, step-2はスキップ）
qa-compiler run qa-workflow.yaml --resume
```

```
Resuming workflow from previous run...
[1/4] Risk Analysis ... skipped (cached)
[2/4] Test Plan ... skipped (cached)
[3/4] Test Analysis ... done (9.1s)
[4/4] Test Design ... done (11.5s)
```

## ワークフロー定義仕様

### ステップタイプ

| タイプ | 説明 |
|-------|------|
| `risk-analysis` | リスク分析 |
| `test-plan` | テスト計画 |
| `test-analysis` | テスト分析 |
| `test-design` | テスト設計 |
| `custom` | カスタムLLMステップ |
| `shell` | シェルコマンド実行（LLMを呼ばない） |

### シェルステップ (`type: shell`)

静的解析ツールなどのシェルコマンドをワークフロー内で実行できる。コマンドのstdoutをJSONとしてパースし、`output_schema` で検証する。

```yaml
steps:
  - id: static-analysis
    name: Static Analysis
    type: shell
    command: |
      cd {{inputs.project_root}} && pnpx ts-morph-analyzer --format json
    output_schema: schemas/code-model.json
    timeout_ms: 60000

  - id: implicit-spec-discovery
    name: Implicit Spec Discovery
    type: custom
    depends_on: [static-analysis]
    prompt_template: |
      コード構造モデルから暗黙の仕様を特定してください。
      {{steps.static-analysis.output}}
    output_schema: schemas/implicit-specs.json
```

**shellステップの仕様:**

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `command` | Yes | 実行するシェルコマンド。テンプレート変数 (`{{inputs.*}}`, `{{steps.*.output}}`) を使用可能 |
| `timeout_ms` | No | コマンドのタイムアウト（ミリ秒） |
| `output_schema` | Yes | stdoutのJSON出力を検証するJSON Schemaファイルパス |

- stdoutは有効なJSONである必要がある
- stderrは `reasoning.log` に記録される（デバッグ情報として有用）
- `model_used` は `"shell"` 固定
- 前ステップの出力は環境変数 `QA_STEP_OUTPUTS` にJSON文字列として注入される

### 入力タイプ

`prd` / `design-doc` / `test-code` / `other`

### ステップ固有のLLM設定

### リトライ設定

```yaml
steps:
  - id: risk-analysis
    name: Risk Analysis
    type: risk-analysis
    retry:
      max_attempts: 5
      backoff_ms: 2000
    prompt_template: ...
    output_schema: schemas/risk-analysis.json
```

## 開発

- Node.js 22 LTS以上
- pnpm
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude` コマンド)

```bash
pnpm install
pnpm test          # テスト実行
pnpm test:watch    # ウォッチモード（ファイル変更時にテストを自動再実行）
pnpm run build     # ビルド
```

## ライセンス

MIT
