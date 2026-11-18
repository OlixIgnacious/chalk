# chalk publish

Uploads a delivered video or Short to YouTube through the YouTube Data API v3: the mp4, title, description, tags,
category, language, thumbnail, captions and playlist. Private unless `--at` schedules it.

```bash
chalk publish auth --client ~/Downloads/client_secret_….json   # once per machine
chalk publish long-output/<slug> --dry-run                   # what would be sent; needs no sign-in
chalk publish shorts-output/<slug> --at "2026-11-06 10:30"      # upload, scheduled (local time)
```

## One-time setup (the channel owner does this)

1. [Google Cloud Console](https://console.cloud.google.com/): create a project, then **APIs & Services → Library →
   YouTube Data API v3 → Enable**.
2. **OAuth consent screen**: External, add your Google account under **Test users** (an unverified app works for
   its test users).
3. **Credentials → Create credentials → OAuth client ID → Desktop app**, then download the JSON.
4. `chalk publish auth --client <that JSON>`: it opens Google's consent page; pick the channel's account and allow
   access. The client and the refresh token are kept in `~/.config/chalk/` (mode 600); nothing goes in a repo.

## What it reads

| | Video dir | Short dir |
|---|---|---|
| file | `video.mp4` | `short.mp4` |
| title | `video.json` `publish.title`, else `title` | `short.json` `publish.title`, else `title` |
| description | `description.txt` (from deliver) | same |
| tags | `publish.tags`, `tags`, else `channel.json` `youtube.tags` | same |
| playlist | `channel.json` `youtube.playlist` (a title or a `PL…` id) | `youtube.shorts_playlist` |
| thumbnail, captions | `thumbnail.png` (≤ 2 MB), `captions.srt` | same |

`channel.json` `youtube.category` (default 27, Education) and `youtube.language` (default en).

## Rules it keeps

- **Never public at once.** Private, or scheduled with `--at` (YouTube keeps it private until then).
- **The owner's declarations stay the owner's.** "Made for kids" (`--made-for-kids yes|no`) and altered or
  synthetic content (`--ai yes|no`) are sent only when given; otherwise set them in Studio.
- **Uploads once.** `<out>/published.json` records the video id and each step; a rerun skips the upload and
  retries only the steps that failed.
- **No Test & Compare.** YouTube has no API for it: after the upload, add the pairs from `video.json`
  `thumbnail.test_compare` in Studio.
- A custom thumbnail needs a verified channel (phone verification in Studio).
