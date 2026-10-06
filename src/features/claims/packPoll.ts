/** Poll API-137 mỗi 2 giây khi `QUEUED` / `RUNNING` (02b-admin §4); WS `evidence_pack.updated` ghi thẳng cache. Test đổi được. */
export const packPoll = { ms: 2000 };
