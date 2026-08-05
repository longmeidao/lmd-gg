/**
 * 「新建合集」弹窗。
 *
 * 版式照 jant 的 `.collection-quick-dialog`（jant-me/jant，
 * packages/core/src/styles/ui.css）：标题 + 右上角取消，中间一个带小标签的
 * 输入框，底部一颗通栏的实心确认键。数值直接取自那份 ui.css，
 * 颜色换成本站的 slate 档位。
 *
 * 用原生 <dialog> + showModal()：焦点收拢、Esc 关闭、背景 inert 都是白送的，
 * 不用自己写一套。
 *
 * 撰写面板和条目管理菜单共用这一个，所以弹窗是用时才建、关掉就移除，
 * 不往两个页面各塞一份 markup。
 */

/** 返回去掉首尾空白的名字；用户取消或没填则返回 null。 */
export const askCollectionName = (): Promise<string | null> =>
  new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'collection-dialog';
    dialog.setAttribute('aria-labelledby', 'collection-dialog-title');

    dialog.innerHTML = `
      <form method="dialog" class="collection-dialog-form">
        <header class="collection-dialog-header">
          <h2 class="collection-dialog-title" id="collection-dialog-title">新建合集</h2>
          <button
            type="button"
            class="collection-dialog-cancel"
            data-cancel
            aria-label="取消"
            title="取消"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.45"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            ><path d="m5.2 5.2 7.6 7.6M12.8 5.2l-7.6 7.6" /></svg>
          </button>
        </header>
        <div class="collection-dialog-body">
          <div class="collection-dialog-field">
            <label class="collection-dialog-label" for="collection-dialog-input">合集名称</label>
            <input
              class="collection-dialog-input"
              id="collection-dialog-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              required
            />
          </div>
        </div>
        <footer class="collection-dialog-footer">
          <button type="submit" class="collection-dialog-submit">完成</button>
        </footer>
      </form>
    `;

    const input = dialog.querySelector<HTMLInputElement>(
      '.collection-dialog-input',
    )!;
    const form = dialog.querySelector<HTMLFormElement>('form')!;

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      dialog.close();
    };

    form.addEventListener('submit', (event) => {
      // method="dialog" 自己会关，但我们要先把值取出来
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      finish(value);
    });

    dialog
      .querySelector<HTMLButtonElement>('[data-cancel]')!
      .addEventListener('click', () => finish(null));

    // Esc 关闭，以及点背景关闭
    dialog.addEventListener('cancel', () => finish(null));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(null);
    });

    // 关闭后一定要把节点摘掉，否则每点一次就往 body 里堆一个
    dialog.addEventListener('close', () => {
      resolve(null); // settled 之后 Promise 已决议，这里是取消路径的兜底
      dialog.remove();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
  });
