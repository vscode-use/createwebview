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
  allowedFontSources?: string[]
  allowedConnectSources?: string[]
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
  private allowedFontSources: string[]
  private allowedConnectSources: string[]
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
    this.allowedFontSources = options.allowedFontSources || []
    this.allowedConnectSources = options.allowedConnectSources || []
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
    const content = await this._getWebviewContent(webviewView.webview)
    webviewView.webview.html = this._injectHeadContent(
      html.replace(/(?:src|href)="([/.][^"]*)"/g, (_, u) => _.replace(u, webviewView.webview.asWebviewUri(
        this._getMediaUri(u),
      ).toString())),
      content.head,
    )
    webviewView.webview.html = this._injectBodyEndContent(webviewView.webview.html, content.bodyEnd)
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
    const content = await this._getWebviewContent(webview)

    return `<!DOCTYPE html>
			<html lang="en">
        <head>
          <meta charset="UTF-8">
          ${content.head}
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${this._title}</title>
        </head>
        <body>
          ${html}
        </body>
        ${content.bodyEnd}
			</html>`
  }

  private async _getWebviewContent(webview: vscode.Webview) {
    const nonce = this._getNonce()
    const styles = this._styles
      .filter(Boolean)
      .map((style) => {
        this._assertExternalResourceAllowed('style', style, this.allowedStyleSources)
        const styleUri = this._isExternalUri(style)
          ? style
          : webview.asWebviewUri(
            this._getMediaUri(style),
          )
        return `<link href="${this._escapeHtmlAttribute(styleUri.toString())}" rel="stylesheet">`
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

      this._assertExternalResourceAllowed('script', script, this.allowedScriptSources)
      const scriptUri = this._isExternalUri(script)
        ? script
        : webview.asWebviewUri(
          this._getMediaUri(script),
        )
      const _script = script.trim().startsWith('<script')
        ? this._renderInlineScript(script, nonce)
        : `<script src="${this._escapeHtmlAttribute(scriptUri.toString())}"></script>`

      if (isPre)
        preScripts.push(_script)
      else
        postScripts.push(_script)
    })
    const scriptsUri = await Promise.all(this.scriptsPromises).then(scripts =>
      scripts.map(script => this._renderInlineScript(script, nonce)),
    )

    return {
      head: `${this._getCspMeta(webview, nonce)}
          ${styles}
          <script nonce="${nonce}">
            if (!window.vscode)
              window.vscode = acquireVsCodeApi();
          </script>
          <script nonce="${nonce}">
            window.__WEBVIEW_PROPS__ = ${this._serializeForInlineScript(this.props)}
          </script>
          ${preScripts.length ? preScripts.join('\n') : ''}`,
      bodyEnd: `${postScripts.join('\n')}
        ${this._renderInlineScript(this._deferScript, nonce)}
        ${scriptsUri.join('\n')}`,
    }
  }

  private _getMediaUri(uri: string) {
    const normalized = uri.replace(/^\/+/, '').replace(/^\.\//, '')
    if (normalized.split('/').includes('..'))
      throw new Error(`Invalid media path: ${uri}`)

    return vscode.Uri.joinPath(this._extensionUri, 'media', normalized)
  }

  private _getNonce() {
    return randomBytes(16).toString('base64')
  }

  private _getCspMeta(webview: vscode.Webview, nonce: string) {
    return `<meta http-equiv="Content-Security-Policy" content="${this._escapeHtmlAttribute(this._getCsp(webview, nonce))}">`
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
    const fontSources = [webview.cspSource, 'https:', 'data:', ...this.allowedFontSources]
    const connectSources = [webview.cspSource, ...this.allowedConnectSources]

    return [
      'default-src \'none\'',
      `img-src ${imageSources.join(' ')}`,
      `font-src ${fontSources.join(' ')}`,
      `connect-src ${connectSources.join(' ')}`,
      `style-src ${styleSources.join(' ')}`,
      `script-src ${scriptSources.join(' ')}`,
    ].join('; ')
  }

  private _injectHeadContent(html: string, content: string) {
    return /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, match => `${match}\n${content}`)
      : `${content}\n${html}`
  }

  private _injectBodyEndContent(html: string, content: string) {
    return /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${content}\n</body>`)
      : `${html}\n${content}`
  }

  private _assertExternalResourceAllowed(kind: 'script' | 'style', uri: string, allowedSources: string[]) {
    if (this.csp || !this._isExternalUri(uri) || this._isAllowedExternalResource(uri, allowedSources))
      return

    throw new Error(`External ${kind} source is not allowed by CSP: ${uri}`)
  }

  private _isExternalUri(uri: string) {
    return /^https?:\/\//.test(uri)
  }

  private _isAllowedExternalResource(uri: string, allowedSources: string[]) {
    const parsed = new URL(uri)

    return allowedSources.some((source) => {
      if (source === '*' || source.includes('*'))
        return true

      if (source === parsed.protocol || source === parsed.origin || source === uri)
        return true

      if (!this._isExternalUri(source))
        return false

      const normalized = source.endsWith('/') ? source : `${source}/`
      return uri.startsWith(normalized)
    })
  }

  private _renderInlineScript(script: string, nonce: string) {
    if (!script)
      return ''

    if (/^<script\b[^>]*\ssrc\s*=/i.test(script.trim()))
      return script

    return script.trim().startsWith('<script')
      ? script.replace(/<script\b(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`)
      : `<script nonce="${nonce}">${script}</script>`
  }

  private _escapeHtmlAttribute(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private _serializeForInlineScript(value: unknown) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
  }
}
