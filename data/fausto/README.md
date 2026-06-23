# data/fausto

Conteúdo bruto do Fausto Bassan para ingestão **semi-manual** no MVP (Fase 0).

O `ManualUploadConnector` (`backend/src/connectors/manual.ts`, E0.4) lê esta
pasta recursivamente e ingere cada arquivo como `document`.

## Formatos aceitos

| Subpasta sugerida | Formatos | Vira |
|---|---|---|
| `posts/` | `.md`, `.txt` | `documents.kind = 'caption'` |
| `transcripts/` | `.md`, `.txt`, `.srt`, `.vtt` | `documents.kind = 'transcript'` |
| `articles/` | `.md`, `.txt` | `documents.kind = 'article'` |
| `audio/`, `video/` | `.mp3`, `.mp4`, `.wav`, `.m4a` | passa por transcrição (E1.5) |

> **Versionamento:** texto (`.md`, `.txt`, `.srt`, `.vtt`) é commitado. Mídia
> binária (`audio/`, `video/`, `.mp3`, `.mp4`, `.wav`, `.m4a`) é ignorada pelo
> git e fica só local — uploads vão para o Supabase Storage durante a ingestão.

## Consentimento

Só ingerir conteúdo **do próprio criador** com `consents.content = granted`
(regra inegociável do CLAUDE.md). O seed cria o registro de consentimento do
Fausto; em produção, o Studio coleta antes de habilitar a fonte.
