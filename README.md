<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> English | <a href="./README_zh.md">简体中文</a></p>

Let you create a webview vscode plug-in in 1 minute

## Install

```
npm i @vscode-use/createwebview
```

## Usage1

```ts
function activate(context: vscode.ExtensionContext) {
  const provider = new CreateWebview(context, {
    viewType: 'dailyPlanner',
    title: 'Daily planner',
    scripts: ['https://unpkg.com/vue@2/dist/vue.js', 'https://unpkg.com/element-ui/lib/index.js'],
    styles: ['reset.css', 'https://unpkg.com/element-ui/lib/theme-chalk/index.css', 'main.css'],
    allowedScriptSources: ['https://unpkg.com'],
    allowedStyleSources: ['https://unpkg.com'],
  })

  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', async () => {
    await provider.create(`
      <div id="app">
        <div>Hello, World</div>
      </div>
    `, (data) => {
      // callback Get the post message data of the js layer
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

## Usage2

```ts
function activate(context: vscode.ExtensionContext) {
  const provider = new CreateWebview(context, {
    viewType: 'dailyPlanner',
    title: 'Daily planner',
  })

  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', async () => {
    // Relative path based on the root directory
    // The local path resource (href="" | src="") in html needs to use the relative path and put it under the media folder in the root directory.
    await provider.createWithHTMLUrl('./src/webview/index.html', (data) => {
      // callback Get the post message data of the js layer
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

## Api

- provider.isActive ***Checks whether the current webview is open***
- provider.create ***Create a webview***
- provider.createWithHTMLUrl ***Create a webview from an HTML file***
- provider.destroy ***Destroy Close the webview***
- provider.destory ***Deprecated alias of destroy***
- provider.deferScript ***Inject trusted inline JavaScript source after the default scripts. External scripts should use scripts or deferScriptUri.***
- provider.deferScriptUri ***Deprecated append alias for deferred script URIs***
- provider.setDeferredScriptUris ***Replace deferred script URIs***
- provider.addDeferredScriptUris ***Append deferred script URIs***
- provider.clearDeferredScriptUris ***Clear deferred script URIs***
- provider.setProps ***Set props available as window.__WEBVIEW_PROPS__ in deferred scripts***
- provider.postMessage ***Send a message to the js layer***

## Feature

Local scripts and styles are resolved from the extension `media` directory by default. Use `mediaRoot` when your assets live under a different extension-relative directory, or `localResourceRoots` when you need to pass explicit VS Code resource roots. Webviews include a default CSP, so remote script/style sources must be listed explicitly with `allowedScriptSources` and `allowedStyleSources`, or replaced by a custom `csp`. Remote entries passed through `scripts` and `styles` are validated before rendering. Remote resources already present in HTML files are governed by the generated CSP. Font and image sources allow VS Code webview resources, `https:`, and `data:` by default; set `strictCsp: true` to allow only VS Code webview resources plus explicit `allowedImageSources` and `allowedFontSources`. Add extra sources with `allowedImageSources`, `allowedFontSources`, `allowedConnectSources`, `allowedMediaSources`, `allowedFrameSources`, `allowedManifestSources`, `allowedWorkerSources`, and `allowedPrefetchSources`.

For `allowedScriptSources` and `allowedStyleSources`, prefer `https:`, an origin such as `https://cdn.example.com`, a wildcard origin such as `https://*.example.com`, or a specific URL/path. Use a custom `csp` for more complex CSP source expressions.

The `scripts` option accepts script paths or URLs only. Use `deferScript` for inline JavaScript.

`createWithHTMLUrl` rewrites local `src` resources on `script`, `img`, `source`, `video`, `audio`, `track`, and `iframe`, plus resource `link href` entries such as stylesheets and icons. It supports double-quoted, single-quoted, and unquoted attributes; paths may start with `./`, a single `/`, or use a bare relative filename such as `src="app.js"`. It also rewrites local `srcset` entries on `img` and `source`, plus local CSS `url(...)` references in inline `style` attributes and `<style>` tags. Normal links such as `a href`, `base href`, and canonical links are not rewritten. External URLs and protocol-relative URLs like `src="//cdn.example.com/app.js"` are not rewritten. CSS files loaded through `link` are not parsed.

HTML files passed to `createWithHTMLUrl` must not include their own CSP meta tag because the runtime injects one. The default CSP applies to the final HTML rendered by both `create(html)` and `createWithHTMLUrl(htmlUrl)`, so inline `<script>`, inline `<style>`, and style attributes are blocked unless you provide a custom `csp`. Put scripts in `media` and load them with `scripts`, `setDeferredScriptUris`, or `addDeferredScriptUris`, or explicitly relax the policy with `csp`.

If an HTML file already includes a CSP meta tag, `createWithHTMLUrl` rejects it by default. Set `existingCsp: 'replace'` to remove the existing tag and inject createwebview's runtime CSP.

When providing a custom `csp`, include `${nonce}` for runtime inline scripts and `${webview.cspSource}` for local webview resources:

```text
script-src ${webview.cspSource} 'nonce-${nonce}';
style-src ${webview.cspSource};
```

`setDeferredScriptUris` and `addDeferredScriptUris` inject browser-ready `.js` files from `media` as external scripts. Compile TypeScript before loading it. Call `setProps` before rendering, then read the values from `window.__WEBVIEW_PROPS__`.

The runtime does not expose the VS Code API on `window` by default. Trusted webview scripts can call `acquireVsCodeApi()` directly. If you need the legacy global API, set `exposeVsCodeApi: true` for `window.vscode`, or pass a string such as `exposeVsCodeApi: 'editorApi'`. When `exposeVsCodeApi` is enabled, business scripts should use `window.vscode` or the configured name instead of calling `acquireVsCodeApi()` again.

```ts
const { name, age } = window.__WEBVIEW_PROPS__
const vscode = acquireVsCodeApi()
vscode.postMessage({ type: 'ready' })
const App = {
  data() {
    return {
      name,
      age,
    }
  },
}
new Vue(App).$mount('#app')
```

## Security model

`create(html)` accepts trusted HTML only. Do not pass unsanitized user input, workspace file contents, file paths, settings, or external API data into the HTML string. Escape or sanitize dynamic content before rendering it.

The default CSP starts from `default-src 'none'`, injects nonce-protected runtime scripts, and limits local resources to the extension `media` directory through `localResourceRoots` unless you configure a different root. Remote scripts and styles must be allowlisted. Images and fonts permit `https:` and `data:` by default for compatibility; use `strictCsp: true` when you want those sources to be explicit.

The VS Code API is not exposed globally unless `exposeVsCodeApi` is enabled.

## Migration from 0.0.x

This release includes breaking behavior changes and should be published as `0.1.0`.

- `retainContextWhenHidden` now defaults to `false`.
- Remote scripts and styles must be allowlisted with `allowedScriptSources` and `allowedStyleSources`, unless you provide a custom `csp`.
- `scripts` accepts paths and URLs only. Use `deferScript` for inline JavaScript.
- `deferScriptUri` now injects an external script from `media` instead of reading and inlining a file. Prefer `setDeferredScriptUris` or `addDeferredScriptUris` for new code.
- Props are available as `window.__WEBVIEW_PROPS__` instead of `webviewThis`.
- The VS Code API is no longer exposed as `window.vscode` by default. Use `acquireVsCodeApi()` inside trusted scripts, or opt in with `exposeVsCodeApi`.

## Cases
- [vscode icones](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-icones)
- [vscode yesicone](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-yesicon)


## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>
