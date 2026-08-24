# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inkdown 面向需要在桌面端编写和管理 Markdown 文档的通用个人用户。

## Product Purpose

Inkdown 提供接近 Typora 的本地 Markdown 编辑体验，让用户直接处理本机文档和工作区，并保持内容可移植。

## Operating Context

用户在桌面应用中打开本地 Markdown 文件或工作区，通过所见即所得或源码模式编辑，并可粘贴、拖入图片。

## Capabilities and Constraints

- 本地文件和本地工作区是核心数据来源。
- 图片默认保存在文档相对目录，也可以选择全局本地目录。
- GitHub 图床是用户主动启用的可选能力，仅面向 GitHub.com 公共仓库。
- Markdown 中的远程图片使用可由其他设备和编辑器访问的标准 HTTPS 地址。

## Product Principles

- 本地优先，云端能力必须由用户明确启用。
- 文档保持标准、可移植，不绑定 Inkdown 专用远程格式。
- 默认行为保持简单，敏感凭证不得明文持久化。
