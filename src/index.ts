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
  allowedMediaSources?: string[]
  allowedFrameSources?: string[]
  allowedManifestSources?: string[]
  allowedWorkerSources?: string[]
  allowedPrefetchSources?: string[]
  csp?: string
  html?: string
  exposeVsCodeApi?: boolean | string
}
export class CreateWebview {
  private webviewView?: vscode.WebviewPanel
  private createRequestId = 0
  private _deferScript = ''
  private _extensionUri: vscode.Uri
  private props: Record<string, any> = {}
  private deferredScriptUris: string[] = []
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
  private allowedMediaSources: string[]
  private allowedFrameSources: string[]
  private allowedManifestSources: string[]
  private allowedWorkerSources: string[]
  private allowedPrefetchSources: string[]
  private csp?: string
  private onMessage?: (data: any) => void
  private exposeVsCodeApi?: string
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
    this.allowedMediaSources = options.allowedMediaSources || []
    this.allowedFrameSources = options.allowedFrameSources || []
    this.allowedManifestSources = options.allowedManifestSources || []
    this.allowedWorkerSources = options.allowedWorkerSources || []
    this.allowedPrefetchSources = options.allowedPrefetchSources || []
    this.csp = options.csp
    if (!this.csp) {
      this._assertValidCspSourceTokens('allowedScriptSources', this.allowedScriptSources)
      this._assertValidCspSourceTokens('allowedStyleSources', this.allowedStyleSources)
      this._assertValidCspSourceTokens('allowedImageSources', this.allowedImageSources)
      this._assertValidCspSourceTokens('allowedFontSources', this.allowedFontSources)
      this._assertValidCspSourceTokens('allowedConnectSources', this.allowedConnectSources)
      this._assertValidCspSourceTokens('allowedMediaSources', this.allowedMediaSources)
      this._assertValidCspSourceTokens('allowedFrameSources', this.allowedFrameSources)
      this._assertValidCspSourceTokens('allowedManifestSources', this.allowedManifestSources)
      this._assertValidCspSourceTokens('allowedWorkerSources', this.allowedWorkerSources)
      this._assertValidCspSourceTokens('allowedPrefetchSources', this.allowedPrefetchSources)
    }
    this.onMessage = options.onMessage
    if (options.exposeVsCodeApi === true)
      this.exposeVsCodeApi = 'vscode'
    else if (typeof options.exposeVsCodeApi === 'string')
      this.exposeVsCodeApi = options.exposeVsCodeApi
  }

  public setProps(props: Record<string, any>) {
    this.props = { ...this.props, ...props }
  }

  public async create(html = this._html, callback: (data: any) => void = () => { }) {
    const requestId = ++this.createRequestId
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

    let renderedHtml: string
    try {
      renderedHtml = await this._getHtmlForWebview(
        webviewView.webview,
        html,
      )
    }
    catch (error) {
      webviewView.dispose()
      if (requestId !== this.createRequestId)
        return
      throw error
    }

    if (requestId !== this.createRequestId) {
      webviewView.dispose()
      return
    }

    this._bindMessageHandler(webviewView, callback)
    webviewView.webview.html = renderedHtml
    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
    })
  }

  public async createWithHTMLUrl(htmlUrl: string, callback: (data: any) => void = () => { }) {
    const requestId = ++this.createRequestId
    let bytes: Uint8Array
    try {
      bytes = await vscode.workspace.fs.readFile(this._getExtensionFileUri(htmlUrl))
    }
    catch (error) {
      if (requestId !== this.createRequestId)
        return
      throw error
    }
    if (requestId !== this.createRequestId)
      return

    const html = Buffer.from(bytes).toString('utf8')
    if (this._hasCspMeta(html))
      throw new Error('createWithHTMLUrl received HTML with an existing CSP meta. Remove it before rendering.')

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

    try {
      const content = await this._getWebviewContent(webviewView.webview)
      if (requestId !== this.createRequestId) {
        webviewView.dispose()
        return
      }

      const renderedHtml = this._injectHeadContent(
        this._rewriteHtmlResources(html, webviewView.webview),
        content.head,
      )
      this._bindMessageHandler(webviewView, callback)
      webviewView.webview.html = this._injectBodyEndContent(renderedHtml, content.bodyEnd)
    }
    catch (error) {
      webviewView.dispose()
      if (requestId !== this.createRequestId)
        return
      throw error
    }

    if (requestId !== this.createRequestId) {
      webviewView.dispose()
      return
    }

    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
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
    this.createRequestId++
    this.webviewView?.dispose()
    this.webviewView = undefined
  }

  public deferScript(scripts: string | string[]) {
    this._deferScript
      = typeof scripts === 'string' ? scripts : scripts.join('\n')
  }

  public deferScriptUri(scriptUri: string | string[]) {
    const uris = typeof scriptUri === 'string' ? [scriptUri] : scriptUri
    this.deferredScriptUris.push(...uris)
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
          <title>${this._escapeHtmlText(this._title)}</title>
        </head>
        <body>
          ${html}
          ${content.bodyEnd}
        </body>
			</html>`
  }

  private async _getWebviewContent(webview: vscode.Webview) {
    const nonce = this._getNonce()
    const styles = this._styles
      .filter(Boolean)
      .map((style) => {
        this._assertSupportedResourceUri(style, 'style')
        this._assertExternalResourceAllowed('style', style, this.allowedStyleSources)
        const styleUri = this._isExternalUri(style)
          ? style
          : webview.asWebviewUri(
            this._getMediaUri(style),
          )
        return `<link href="${this._escapeHtmlAttribute(styleUri.toString())}" rel="stylesheet">`
      })
      .join('\n')

    if (!this.enableScripts) {
      return {
        head: `${this._getCspMeta(webview, nonce)}
          ${styles}`,
        bodyEnd: '',
      }
    }

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

      if (/^<script\b/i.test(script.trim()))
        throw new Error('Use script paths/URLs in options.scripts; use deferScript for inline scripts.')

      this._assertSupportedResourceUri(script, 'script')
      this._assertExternalResourceAllowed('script', script, this.allowedScriptSources)
      const scriptUri = this._isExternalUri(script)
        ? script
        : webview.asWebviewUri(
          this._getMediaUri(script),
        )
      const _script = `<script src="${this._escapeHtmlAttribute(scriptUri.toString())}"></script>`

      if (isPre)
        preScripts.push(_script)
      else
        postScripts.push(_script)
    })
    const scriptsUri = this.deferredScriptUris
      .map((uri) => {
        this._assertSupportedResourceUri(uri, 'deferred script')
        const src = webview.asWebviewUri(this._getMediaUri(uri)).toString()
        return `<script src="${this._escapeHtmlAttribute(src)}"></script>`
      })
    let vscodeApiScript = ''
    if (this.exposeVsCodeApi) {
      const apiName = this._serializeForInlineScript(this.exposeVsCodeApi)
      vscodeApiScript = `<script nonce="${nonce}">
            if (!window[${apiName}])
              window[${apiName}] = acquireVsCodeApi();
          </script>`
    }

    return {
      head: `${this._getCspMeta(webview, nonce)}
          ${styles}
          ${vscodeApiScript}
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
    const match = uri.match(/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/)
    const rawPath = match?.[1] ?? uri
    const query = match?.[2] ?? ''
    const fragment = match?.[3] ?? ''
    const normalized = this._normalizeSafePath(rawPath, 'media', uri)

    const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media', normalized)
    return query || fragment ? mediaUri.with({ query, fragment }) : mediaUri
  }

  private _getExtensionFileUri(uri: string) {
    const normalized = this._normalizeSafePath(uri, 'extension file', uri)

    return vscode.Uri.joinPath(this._extensionUri, normalized)
  }

  private _normalizeSafePath(path: string, kind: string, originalUri: string) {
    const normalized = path
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\/+/, '')

    let decoded = ''
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/g, '/')
    }
    catch {
      throw new Error(`Invalid ${kind} path: ${originalUri}`)
    }

    if (decoded.split('/').some(segment => segment.toLowerCase() === '..'))
      throw new Error(`Invalid ${kind} path: ${originalUri}`)

    return normalized
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
    const mediaSources = [webview.cspSource, ...this.allowedMediaSources]
    const frameSources = [webview.cspSource, ...this.allowedFrameSources]
    const manifestSources = [webview.cspSource, ...this.allowedManifestSources]
    const workerSources = [webview.cspSource, ...this.allowedWorkerSources]
    const prefetchSources = [webview.cspSource, ...this.allowedPrefetchSources]

    return [
      'default-src \'none\'',
      'base-uri \'none\'',
      'form-action \'none\'',
      'object-src \'none\'',
      `img-src ${imageSources.join(' ')}`,
      `font-src ${fontSources.join(' ')}`,
      `connect-src ${connectSources.join(' ')}`,
      `style-src ${styleSources.join(' ')}`,
      `script-src ${scriptSources.join(' ')}`,
      `media-src ${mediaSources.join(' ')}`,
      `frame-src ${frameSources.join(' ')}`,
      `manifest-src ${manifestSources.join(' ')}`,
      `worker-src ${workerSources.join(' ')}`,
      `prefetch-src ${prefetchSources.join(' ')}`,
    ].join('; ')
  }

  private _injectHeadContent(html: string, content: string) {
    if (/<head\b[^>]*>/i.test(html))
      return html.replace(/<head\b[^>]*>/i, match => `${match}\n${content}`)

    if (/<html\b[^>]*>/i.test(html))
      return html.replace(/<html\b[^>]*>/i, match => `${match}\n<head>\n${content}\n</head>`)

    if (/^\s*<!doctype\b[^>]*>/i.test(html))
      return html.replace(/^\s*<!doctype\b[^>]*>/i, match => `${match}\n<html>\n<head>\n${content}\n</head>\n`)

    return `<head>\n${content}\n</head>\n${html}`
  }

  private _injectBodyEndContent(html: string, content: string) {
    return /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, () => `${content}\n</body>`)
      : `${html}\n${content}`
  }

  private _bindMessageHandler(webviewView: vscode.WebviewPanel, callback: (data: any) => void) {
    webviewView.webview.onDidReceiveMessage((data: any) => {
      callback(data)
      this.onMessage?.(data)
    })
  }

  private _hasCspMeta(html: string) {
    return /<meta\b[^>]*\bhttp-equiv\s*=\s*(?:"\s*content-security-policy\s*"|'\s*content-security-policy\s*'|content-security-policy\b)/i.test(html)
  }

  private _rewriteHtmlResources(html: string, webview: vscode.Webview) {
    const rewriteUri = (uri: string) => {
      return this._escapeHtmlAttribute(webview.asWebviewUri(this._getMediaUri(uri)).toString())
    }

    return html
      .replace(/<((?:script|img|source|video|audio|track|iframe)\b[^>]*?\s+src\s*=\s*")(\/(?!\/)[^"]*|\.\/[^"]*)"/gi, (_match, before, uri) => {
        return `<${before}${rewriteUri(uri)}"`
      })
      .replace(/<link\b[^>]*>/gi, (tag) => {
        if (!this._isResourceLinkTag(tag))
          return tag

        return tag.replace(/(\s+href\s*=\s*")(\/(?!\/)[^"]*|\.\/[^"]*)"/i, (_match, before, uri) => {
          return `${before}${rewriteUri(uri)}"`
        })
      })
  }

  private _isResourceLinkTag(tag: string) {
    const rel = tag.match(/\s+rel\s*=\s*"([^"]*)"/i)?.[1]
    if (!rel)
      return false

    const resourceRels = new Set([
      'apple-touch-icon',
      'apple-touch-icon-precomposed',
      'icon',
      'manifest',
      'mask-icon',
      'modulepreload',
      'prefetch',
      'preload',
      'stylesheet',
    ])

    return rel.toLowerCase().split(/\s+/).some(value => resourceRels.has(value))
  }

  private _assertExternalResourceAllowed(kind: 'script' | 'style', uri: string, allowedSources: string[]) {
    if (this.csp || !this._isExternalUri(uri) || this._isAllowedExternalResource(uri, allowedSources))
      return

    throw new Error(`External ${kind} source is not allowed by CSP: ${uri}`)
  }

  private _assertSupportedResourceUri(uri: string, kind: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) && !this._isExternalUri(uri))
      throw new Error(`Unsupported ${kind} URI scheme: ${uri}`)
  }

  private _isExternalUri(uri: string) {
    try {
      const protocol = new URL(uri).protocol
      return protocol === 'http:' || protocol === 'https:'
    }
    catch {
      return false
    }
  }

  private _isAllowedExternalResource(uri: string, allowedSources: string[]) {
    const parsed = new URL(uri)

    return allowedSources.some((source) => {
      if (source === '*')
        return true

      if (source === parsed.protocol || source === parsed.origin || source === uri)
        return true

      const wildcardSource = source.match(/^(https?:)\/\/\*\.(.+)$/)
      if (wildcardSource) {
        const [, protocol, hostname] = wildcardSource
        return parsed.protocol === protocol && parsed.hostname.endsWith(`.${hostname.replace(/\/$/, '')}`)
      }

      if (!this._isExternalUri(source))
        return false

      const allowed = new URL(source)
      if (allowed.origin !== parsed.origin)
        return false

      const allowedPath = allowed.pathname.endsWith('/') ? allowed.pathname : `${allowed.pathname}/`
      return parsed.pathname === allowed.pathname || parsed.pathname.startsWith(allowedPath)
    })
  }

  private _assertValidCspSourceTokens(optionName: string, sources: string[]) {
    const invalidSource = sources.find(source => /[\s;"<>]/.test(source))
    if (invalidSource)
      throw new Error(`Invalid CSP source token in ${optionName}: ${invalidSource}`)
  }

  private _renderInlineScript(script: string, nonce: string) {
    if (!script)
      return ''

    if (/^<script\b[^>]*\ssrc\s*=/i.test(script.trim()))
      throw new Error('deferScript only accepts inline scripts. Use deferScriptUri or options.scripts for script files.')

    if (/<script\b[^>]*\snonce\s*=/i.test(script))
      throw new Error('deferScript should not include nonce; createwebview injects it automatically.')

    return /^<script\b/i.test(script.trim())
      ? script.replace(/<script\b(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`)
      : `<script nonce="${nonce}">${script}</script>`
  }

  private _escapeHtmlText(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
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
