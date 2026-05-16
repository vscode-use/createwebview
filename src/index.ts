import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

export interface Options {
  viewType?: string
  title?: string
  scripts?: string | (string | { enforce?: 'pre' | 'post'; src: string })[]
  styles?: string | string[]
  onMessage?: (data: any) => void
  viewColumn?: vscode.ViewColumn
  retainContextWhenHidden?: boolean
  enableScripts?: boolean
  allowedScriptSources?: string[]
  allowedStyleSources?: string[]
  allowedImageSources?: string[]
  csp?: string
  html?: string
}
export class CreateWebview {
  private webviewView?: vscode.WebviewPanel
  private _deferScript = ''
  private _extensionUri: vscode.Uri
  private props: Record<string, any> = {}
  private scriptsPromises: Promise<string>[] = []
  private viewColumn: vscode.ViewColumn
  private _viewType: string
  private _title: string
  private _html: string
  private _scripts: (string | { enforce?: 'pre' | 'post'; src: string })[]
  private _styles: string[]
  private retainContextWhenHidden: boolean
  private enableScripts: boolean
  private allowedScriptSources: string[]
  private allowedStyleSources: string[]
  private allowedImageSources: string[]
  private csp?: string
  private onMessage?: (data: any) => void
  constructor(
    extension: vscode.ExtensionContext | vscode.Uri,
    options: Options,
  ) {
    this._extensionUri = 'extensionUri' in extension ? extension.extensionUri : extension
    this._title = options.title || 'webview'
    this._viewType = options.viewType || this._title
    this._html = options.html || ''
    this._scripts = options.scripts
      ? (Array.isArray(options.scripts) ? options.scripts : [options.scripts])
      : []
    this._styles = options.styles
      ? (Array.isArray(options.styles) ? options.styles : [options.styles])
      : []
    this.viewColumn = options.viewColumn || vscode.ViewColumn.One
    this.retainContextWhenHidden = options.retainContextWhenHidden ?? false
    this.enableScripts = options.enableScripts ?? true
    this.allowedScriptSources = options.allowedScriptSources || []
    this.allowedStyleSources = options.allowedStyleSources || []
    this.allowedImageSources = options.allowedImageSources || []
    this.csp = options.csp
    this.onMessage = options.onMessage
  }

  public setProps(props: Record<string, any>) {
    this.props = { ...this.props, ...props }
  }

  public async create(html = this._html, callback: (data: any) => void = () => { }) {
    const webviewView = vscode.window.createWebviewPanel(
      this._viewType, // 视图的声明方式
      this._title, // 选项卡标题
      this.viewColumn, // 在编辑器中显示的视图位置
      {
        enableScripts: this.enableScripts, // 启用JS,否则内容将被视为静态HTML
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
        retainContextWhenHidden: this.retainContextWhenHidden,
      },
    )
    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
    })
    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview,
      html,
    )
    webviewView.webview.onDidReceiveMessage((data: any) => {
      callback(data)
      this.onMessage && this.onMessage(data)
    })
  }

  public async createWithHTMLUrl(htmlUrl: string, callback: (data: any) => void = () => { }) {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this._extensionUri, htmlUrl))
    const html = Buffer.from(bytes).toString('utf8')
    const webviewView = vscode.window.createWebviewPanel(
      this._viewType, // 视图的声明方式
      this._title, // 选项卡标题
      this.viewColumn, // 在编辑器中显示的视图位置
      {
        enableScripts: this.enableScripts, // 启用JS,否则内容将被视为静态HTML
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
        retainContextWhenHidden: this.retainContextWhenHidden,
      },
    )
    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
    })
    const nonce = this._getNonce()
    const runtime = `${this._getCspMeta(webviewView.webview, nonce)}
<script nonce="${nonce}">
  window.vscode = acquireVsCodeApi();
  window.__WEBVIEW_PROPS__ = ${JSON.stringify(this.props)}
</script>`
    webviewView.webview.html = this._injectHeadContent(
      html.replace(/(?:src|href)="([/.][^"]*)"/g, (_, u) => _.replace(u, webviewView.webview.asWebviewUri(
        this._getMediaUri(u),
      ).toString())),
      runtime,
    )
    webviewView.webview.onDidReceiveMessage((data: any) => {
      callback(data)
      this.onMessage && this.onMessage(data)
    })
  }

  public isActive() {
    try {
      if (this.webviewView)
        return this.webviewView.active
    }
    catch (error) {

    }

    return false
  }

  public destory() {
    this.destroy()
  }

  public destroy() {
    this.webviewView?.dispose()
    this.webviewView = undefined
  }

  public deferScript(scripts: string | string[]) {
    this._deferScript
      = typeof scripts === 'string' ? scripts : scripts.join('\n')
  }

  public deferScriptUri(scriptUri: string | string[]) {
    const uris = typeof scriptUri === 'string' ? [scriptUri] : scriptUri
    this.scriptsPromises.push(...uris.map(async (uri) => {
      const bytes = await vscode.workspace.fs.readFile(this._getMediaUri(uri))
      return Buffer.from(bytes).toString('utf8')
    }))
  }

  public async postMessage(data: any) {
    return this.webviewView?.webview.postMessage(data) ?? false
  }

  private async _getHtmlForWebview(webview: vscode.Webview, html: string) {
    const nonce = this._getNonce()
    const outerUriReg = /^http[s]:\/\//
    const styles = this._styles
      .filter(Boolean)
      .map((style) => {
        const styleUri = outerUriReg.test(style)
          ? style
          : webview.asWebviewUri(
            this._getMediaUri(style),
          )
        return `<link href="${styleUri}" rel="stylesheet">`
      })
      .join('\n')
    const preScripts: string[] = []
    const postScripts: string[] = []
    const scripts = this._scripts

    scripts.forEach((script) => {
      let isPre = false
      if (typeof script !== 'string') {
        isPre = script.enforce === 'pre'
        script = script.src
      }
      if (!script)
        return

      const scriptUri = outerUriReg.test(script)
        ? script
        : webview.asWebviewUri(
          this._getMediaUri(script),
        )
      const _script = script.startsWith('<script')
        ? this._renderScript(script, nonce)
        : `<script nonce="${nonce}" src="${scriptUri}"></script>`

      if (isPre)
        preScripts.push(_script)
      else
        postScripts.push(_script)
    })
    const scriptsUri = await Promise.all(this.scriptsPromises).then(scripts =>
      scripts.map(script => this._renderScript(script, nonce)),
    )

    return `<!DOCTYPE html>
			<html lang="en">
        <head>
          <meta charset="UTF-8">
          ${this._getCspMeta(webview, nonce)}
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${this._title}</title>
          ${styles}
          <script nonce="${nonce}">
            window.vscode = acquireVsCodeApi();
          </script>
          <script nonce="${nonce}">
            window.__WEBVIEW_PROPS__ = ${JSON.stringify(this.props)}
          </script>
          ${preScripts.length ? preScripts.join('\n') : ''}
        </head>
        <body>
          ${html}
        </body>
        ${postScripts.join('\n')}
        ${this._renderScript(this._deferScript, nonce)}
        ${scriptsUri.join('\n')}
			</html>`
  }

  private _getMediaUri(uri: string) {
    return vscode.Uri.joinPath(this._extensionUri, 'media', uri.replace(/^\.?\//, ''))
  }

  private _getNonce() {
    return randomBytes(16).toString('base64')
  }

  private _getCspMeta(webview: vscode.Webview, nonce: string) {
    return `<meta http-equiv="Content-Security-Policy" content="${this._getCsp(webview, nonce)}">`
  }

  private _getCsp(webview: vscode.Webview, nonce: string) {
    if (this.csp) {
      return this.csp
        .replace(/\$\{nonce\}/g, nonce)
        .replace(/\$\{webview.cspSource\}/g, webview.cspSource)
    }

    const scriptSources = [`'nonce-${nonce}'`, webview.cspSource, ...this.allowedScriptSources]
    const styleSources = [webview.cspSource, ...this.allowedStyleSources]
    const imageSources = [webview.cspSource, 'https:', 'data:', ...this.allowedImageSources]

    return [
      'default-src \'none\'',
      `img-src ${imageSources.join(' ')}`,
      `style-src ${styleSources.join(' ')}`,
      `script-src ${scriptSources.join(' ')}`,
    ].join('; ')
  }

  private _injectHeadContent(html: string, content: string) {
    return /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, `${content}\n</head>`)
      : `${content}\n${html}`
  }

  private _renderScript(script: string, nonce: string) {
    if (!script)
      return ''

    return script.trim().startsWith('<script')
      ? script.replace(/<script\b(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`)
      : `<script nonce="${nonce}">${script}</script>`
  }
}
