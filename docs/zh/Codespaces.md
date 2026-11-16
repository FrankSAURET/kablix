# 通过 GitHub Codespaces 在浏览器中使用 Kablix

GitHub Codespaces 在浏览器中打开 VS Code，运行于远程 Linux 机器上。Kablix 可在其中使用：接线编辑器、Uno、Mega 和 Pico 仿真、Arduino 编译、控制台。适用于无法安装任何软件的电脑（Chromebook、受限机房）。

## 不可用的功能

- **上传到真实开发板**（通过 USB 连接的 Arduino 或 Pico）：开发板插在本地电脑上，而 codespace 运行在远程服务器上。
- **本地 Pico W 服务器**：它运行在服务器上，而不是本地电脑上。
- vscode.dev 和 github.dev（无服务器的 VS Code）无法运行 Kablix。

## 一次性设置

1. 为项目创建一个 GitHub 仓库（`.ino` 草图、`.py` 程序、`.projix` 项目）。
2. 将 Kablix 模板的 [`.devcontainer`](https://github.com/FrankSAURET/kablix/tree/main/docs/exemples/codespaces/.devcontainer) 文件夹复制到仓库根目录。
3. 提交并推送到 GitHub。

每次创建 codespace 时，模板会安装 Kablix、arduino-cli 和 `arduino:avr` 内核。首次创建需要两到三分钟。

## 打开 codespace

1. 在仓库页面：**Code** 按钮，**Codespaces** 选项卡，**Create codespace on main**。
2. VS Code 在浏览器中打开。等待安装完成（“postCreateCommand”终端）。
3. 打开草图或 `.projix`：Kablix 的使用方式与本地电脑相同。

已停止的 codespace 可在同一页面重新打开，文件仍在。记得提交并推送修改：未使用的 codespace 会在 30 天后被删除。

## 不使用模板

从扩展面板安装 Kablix，然后在终端中执行以下命令以编译 Arduino 代码：

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sudo BINDIR=/usr/local/bin sh
arduino-cli core update-index && arduino-cli core install arduino:avr
```

## 费用

GitHub 个人账户每月有 120 核心小时的免费额度，即在 2 核机器上可用 60 小时。GitHub Education 账户（学生、教师）额度更多。使用后请停止 codespace：闲置 30 分钟后它会自动停止。
