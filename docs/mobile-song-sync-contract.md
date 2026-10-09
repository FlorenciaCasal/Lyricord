# Mobile song sync contract

This is the Musum 1.0 backend contract prepared for a later mobile `SongSyncEngine`.
SQLite remains the visible source of truth in mobile; this API only provides backup/sync transport.

All endpoints require the existing mobile bearer access token.

## Pull

`GET /api/v1/mobile/sync/songs`

Query:

- `since` optional ISO timestamp. Returns songs with `updatedAt > since`.
- `cursor` optional opaque cursor returned by the previous pull response. When present, it takes precedence over `since`.
- `limit` optional, max `200`.

Response:

```json
{
  "songs": [
    {
      "id": "remote song id",
      "clientId": "local stable id or null",
      "title": "",
      "artist": null,
      "key": null,
      "versionName": "Principal",
      "versionGroupId": null,
      "content": "",
      "notes": null,
      "deletedAt": null,
      "createdAt": "2026-10-08T00:00:00.000Z",
      "updatedAt": "2026-10-08T00:00:00.000Z"
    }
  ],
  "serverTime": "2026-10-08T00:00:00.000Z",
  "nextCursor": null
}
```

Deleted songs are returned as tombstones with `deletedAt != null` so mobile can hide/delete local copies deliberately.

## Push

`POST /api/v1/mobile/sync/songs`

Request:

```json
{
  "changes": [
    {
      "id": "remote id if known",
      "clientId": "local stable id",
      "baseUpdatedAt": "last server updatedAt observed by this device",
      "versionGroupId": "remote principal/group id if known",
      "versionGroupClientId": "local principal/group id if remote id is not known yet",
      "title": "",
      "artist": null,
      "key": null,
      "versionName": "Principal",
      "content": "",
      "notes": null,
      "deletedAt": null
    }
  ]
}
```

Rules:

- `clientId` is used for idempotency and is unique per user.
- Web-created songs can have `clientId = null`.
- Retrying the same create with the same `clientId` returns the already-created remote song as `unchanged`.
- Updating an existing remote song requires `baseUpdatedAt` unless the submitted content is identical.
- If the server row changed since `baseUpdatedAt`, the result is `conflict` and includes the server copy.
- Deletes are soft deletes. The server returns a tombstone instead of removing the row.
- Versions keep their group via `versionGroupId` or `versionGroupClientId`.

Response:

```json
{
  "results": [
    {
      "clientId": "local stable id",
      "id": "remote id",
      "status": "created | updated | deleted | unchanged | conflict | error",
      "song": {
        "id": "remote id",
        "clientId": "local stable id",
        "title": "",
        "artist": null,
        "key": null,
        "versionName": "Principal",
        "versionGroupId": null,
        "content": "",
        "notes": null,
        "deletedAt": null,
        "createdAt": "2026-10-08T00:00:00.000Z",
        "updatedAt": "2026-10-08T00:00:00.000Z"
      }
    }
  ],
  "serverTime": "2026-10-08T00:00:00.000Z"
}
```

Per-item errors are recoverable. The request can return HTTP 200 with individual `error` results.
Global malformed requests return `400`.
