# Design Doc: TODO App — 期限・優先度機能

## 概要

TODOアプリに期限(due_date)と優先度(priority)を追加する。バックエンド(Go)のデータモデル・API変更と、フロントエンド(React)のUI変更を行う。

## バックエンド設計

### データモデル変更

```go
type Todo struct {
    ID        string    `json:"id"`
    Title     string    `json:"title"`
    Completed bool      `json:"completed"`
    Priority  string    `json:"priority"`   // "high" | "medium" | "low"
    DueDate   *string   `json:"due_date"`   // "YYYY-MM-DD" or null
    CreatedAt time.Time `json:"created_at"`
}
```

- `Priority`: 必須。デフォルト値 `"medium"`。
- `DueDate`: 任意。`*string` (nilpointer) で「期限なし」を表現。

### API変更

#### POST /api/todos (作成)

リクエストボディに `priority` と `due_date` を追加:

```json
{
  "title": "買い物に行く",
  "priority": "high",
  "due_date": "2026-03-15"
}
```

- `priority` 省略時は `"medium"` をデフォルトとする
- `due_date` 省略時は `null` とする

#### PUT /api/todos/:id (更新)

リクエストボディに `priority` と `due_date` を追加:

```json
{
  "title": "買い物に行く",
  "completed": false,
  "priority": "low",
  "due_date": "2026-03-20"
}
```

#### GET /api/todos (一覧)

レスポンスに `priority` と `due_date` フィールドを追加。

クエリパラメータでサーバーサイドソートをサポート:
- `sort`: `priority` | `due_date` | `created_at` (デフォルト: `priority`)
- `order`: `asc` | `desc` (デフォルト: ソート基準による)

### バリデーション

- `priority`: `high`, `medium`, `low` のいずれか。不正値は 400 Bad Request。
- `due_date`: `YYYY-MM-DD` 形式の有効な日付。不正形式は 400 Bad Request。過去の日付は許可。

### 後方互換性

- 既存TODOには `priority: "medium"`, `due_date: null` をデフォルト設定
- 新フィールドはレスポンスに常に含む（クライアントが無視しても問題なし）

## フロントエンド設計

### 型定義変更

```typescript
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  priority: "high" | "medium" | "low";
  due_date: string | null;
  created_at: string;
}
```

### コンポーネント変更

#### AddTodo

- 優先度セレクトボックスを追加 (high / medium / low)
- 期限入力 (`<input type="date">`) を追加
- いずれも任意入力

#### TodoItem

- 優先度に応じた色付きバッジを表示
- 期限がある場合は日付を表示
- 期限切れ（未完了かつ期限 < 今日）の場合は赤字 + 警告アイコン
- 期限が当日の場合は「今日まで」ラベル

#### TodoList

- ソートセレクトボックスを追加
- フィルタUI（優先度チェックボックス、「期限切れのみ」トグル、「完了済みを隠す」トグル）
- ソート・フィルタはクライアントサイドで処理

### 状態管理

- `sortBy` / `filterPriority` / `showOverdueOnly` / `hideCompleted` を `useState` で管理
- `useMemo` でフィルタ・ソート結果をメモ化
- APIレイヤー (`api.ts`) に `priority` と `due_date` パラメータを追加

## テスト方針

### バックエンド

- `handler_test.go` に優先度・期限関連のテストを追加
- バリデーション: 不正な priority 値、不正な日付形式
- デフォルト値: priority 省略時に `"medium"` が設定される
- ソートパラメータのテスト

### フロントエンド

- コンポーネントテスト: 優先度バッジの色、期限切れ表示
- 統合テスト: フィルタ・ソートの動作
- APIモック: 新しいリクエスト/レスポンス形式の確認
