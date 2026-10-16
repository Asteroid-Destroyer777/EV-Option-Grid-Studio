// Explicit experiment; the source connection limits remain intact in the base case.
export function gridCaseNodes(nodes, kind = 'base') {
  if (!['base','limited'].includes(kind)) throw new Error('Неизвестный сетевой пример.');
  return nodes.map(n => {
    const baseHeadroom = n.baseHeadroom ?? n.headroom;
    return {...n,baseHeadroom,headroom:kind==='limited'&&n.id==='SUB-ZIL-01'?.3:baseHeadroom};
  });
}
