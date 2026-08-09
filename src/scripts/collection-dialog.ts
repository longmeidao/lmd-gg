/** 撰写面板和条目管理共用的原生「新建合集」弹窗。 */

/** 返回去除首尾空白的名称；取消或留空时返回 null。 */
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
      // 关闭前读取输入值。
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

    // 支持 Esc 和点击背景关闭。
    dialog.addEventListener('cancel', () => finish(null));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(null);
    });

    // 关闭后移除临时节点。
    dialog.addEventListener('close', () => {
      resolve(null); // Promise 已决议时不会重复生效。
      dialog.remove();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
  });
