// declarations.d.ts
declare module '@mind-elixir/node-menu' {
  import { MindElixir, NodeObj } from 'mind-elixir';

  export interface MenuItem {
    text: string;
    icon?: string;
    callback?: (node: NodeObj) => void;
    children?: MenuItem[];
  }

  export interface NodeMenuPlugin {
    addItem(item: MenuItem): void;
    removeItem(text: string): void;
    getItems(): MenuItem[];
  }

  export function install(
    mind: MindElixir,
    options?: {
      items?: MenuItem[];
    }
  ): NodeMenuPlugin;

  // 默认导出是安装函数，但有时需要直接导出
  const nodeMenu: {
    install: typeof install;
    default: typeof install;
  };

  export default nodeMenu;
}