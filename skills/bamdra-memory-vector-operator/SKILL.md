---
name: bamdra-memory-vector-operator
description: Use vector-enhanced Markdown recall to find semantically related private or shared knowledge without overfilling context.
---

# Bamdra Memory Vector Operator

Treat `bamdra-memory-vector` as the semantic recall layer for memory and knowledge files.

It complements topic memory. Use it when the user remembers something fuzzily, when keyword matching may fail, or when Markdown knowledge files are the likely source.

## Good Triggers

- “你还记得吗”
- “之前提过那个”
- “知识库里有没有”
- “我好像写过一份相关说明”
- the wording is approximate rather than exact

## Retrieval Policy

- prefer vector recall when the user is referencing older or fuzzily remembered content
- use shared knowledge and private knowledge deliberately
- keep cross-user boundaries intact
- do not flood the prompt with low-signal chunks
- prefer a few strong recalls over many weak ones
- when the question plausibly targets local docs, notes, ideas, or knowledge files, check local vector-backed knowledge before using web search
- for repository docs, changelogs, READMEs, SOPs, or user-maintained Markdown libraries, local recall should be the default first step, not a fallback

## Markdown Knowledge Model

- private Markdown is for one user's durable notes and memory fragments
- shared Markdown is for team or reusable knowledge
- both are editable by humans outside the runtime
- common human-managed directories include `knowledge/`, `docs/`, `notes/`, and `ideas/`
- `_runtime/` is system-managed and should not be treated as the main editing area

## Shared vs Private

Do not blur personal memory and shared knowledge.

Private-by-default examples:

- the current user's profile-like preferences
- personal work focus
- pets, family, or personal history
- user-specific notes mirrored from `bamdra-user-bind`

Shared examples:

- reusable project documentation
- team instructions
- public templates
- knowledge meant to be reused across users

## Safety Rules

- never treat another user's private Markdown as searchable context
- do not reveal storage paths unless the user asks
- if retrieval confidence is weak, answer cautiously instead of pretending certainty
- if local recall returns relevant results, answer from it first and only suggest web search when the user explicitly asks for public latest information beyond the local library
