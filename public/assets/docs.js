// 한 기록에 통째로 담는 자료(조직도·TO·평가)를 읽고 쓴다. records 의 kind 하나에 기록이 하나뿐이다.
export async function loadDoc(store, kind, id, empty) {
  const rows = await store.records(kind);
  const row = rows.find((r) => r.id === id) ?? rows[0];
  return row ? row.data : JSON.parse(JSON.stringify(empty));
}

export function saveDoc(store, kind, id, data) {
  return store.saveRecord(kind, id, data);
}
