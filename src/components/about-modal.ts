/*
<about-modal>
Sosyokuについて。GitHubへのリンクを含む簡易モーダル(情報表示のみなので閉じるボタン1つ)。
*/
import { t } from '../i18n/index.ts';

interface AboutModalElement extends HTMLElement {
  open(): Promise<void>;
}

const REPO_URL = 'https://github.com/azulamb/sosyoku';

((script, init) => {
  const tagname = script.dataset['aboutModal'] || 'about-modal';
  if (customElements.get(tagname)) {
    return;
  }
  if (document.readyState !== 'loading') {
    return init(script, tagname);
  }
  document.addEventListener('DOMContentLoaded', () => {
    init(script, tagname);
  });
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements AboutModalElement {
      open(): Promise<void> {
        return new Promise((resolve) => {
          const dialog = document.createElement('dialog');
          dialog.style.cssText = 'padding:0;border:none;max-width:min(90vw,420px);width:100%;';

          const body = document.createElement('div');
          body.style.cssText = 'padding:20px;';

          const heading = document.createElement('div');
          heading.textContent = t('about.appName');
          heading.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:6px;';

          const desc = document.createElement('p');
          desc.textContent = t('about.tagline');
          desc.style.cssText = 'color:var(--text-muted);margin:0 0 16px;font-size:12px;';

          const link = document.createElement('a');
          link.href = REPO_URL;
          link.textContent = REPO_URL;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'color:var(--accent);font-size:12px;word-break:break-all;';

          const footer = document.createElement('div');
          footer.style.cssText =
            'display:flex;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--border);';
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.textContent = t('dialog.close');
          closeBtn.style.cssText =
            'background:var(--accent);color:var(--accent-contrast);border:none;border-radius:4px;padding:6px 14px;';
          footer.appendChild(closeBtn);

          body.appendChild(heading);
          body.appendChild(desc);
          body.appendChild(link);
          dialog.appendChild(body);
          dialog.appendChild(footer);
          document.body.appendChild(dialog);

          const cleanup = () => {
            dialog.close();
            dialog.remove();
            resolve();
          };
          closeBtn.addEventListener('click', cleanup);
          dialog.addEventListener('cancel', cleanup);
          dialog.addEventListener('click', (e) => {
            if (e.target === dialog) cleanup();
          });

          dialog.showModal();
        });
      }
    },
  );
});
