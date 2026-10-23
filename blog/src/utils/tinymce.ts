/**
 * TinyMCE 自托管编辑器公共配置（写文章弹窗 / 文章编辑页共用）。
 * 脚本与皮肤/主题/插件全部从 /tinymce（public 静态资源）加载，
 * license_key 使用 gpl，避免出现未注册域名的授权提示。
 */
export function makeTinyMceInit(height = 340, placeholder = '在这里写下文章正文…') {
  return {
    license_key: 'gpl',
    promotion: false,
    branding: false,
    base_url: '/tinymce',
    suffix: '.min',
    height,
    menubar: false,
    statusbar: true,
    plugins: 'lists link code table image preview',
    toolbar:
      'undo redo | blocks | bold italic underline | bullist numlist | link image table | code preview',
    placeholder,
    content_style:
      'body{font-family:ui-sans-serif,system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.8;color:#1f2d3d;margin:12px}',
    skin: 'oxide'
  }
}
