// 아주 작은 DOM 도우미. 프레임워크 없이 el('div', { class: 'x', onclick }, ...children) 꼴로 요소를 만든다.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'hidden') node.hidden = !!value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  append(node, ...children);
  return node;
}

// 자식을 모두 갈아 끼운다. replaceChildren 은 null 을 'null' 글자로 찍으므로 append 를 거쳐 걸러 낸다.
export function replace(node, ...children) {
  node.replaceChildren();
  return append(node, ...children);
}

// null·false·undefined 는 건너뛴다. 조건부로 자식을 넣을 때 편하다. 배열이 섞여 있어도 펼친다.
export function append(node, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}
