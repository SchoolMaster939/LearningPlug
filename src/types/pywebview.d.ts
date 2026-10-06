declare global {
  interface Window {
    pywebview: {
      api: {
        get_base_url: () => Promise<string>;

        open_folder_dialog: () => Promise<string | null>;
        saveConfigPath: (path: string) => Promise<boolean>;
        readSavePath: () => Promise<string>;

        load_ConfigAvailableDetect: () => Promise<boolean | null>;
        ConfigAvailableDetect_switch: (input: boolean) => void;

        load_TreeModeAutoTopicRelevance: () => Promise<boolean | null>;
        TreeModeAutoTopicRelevance_switch: (input: boolean) => void;

        load_Turns: () => Promise<number | null>;
        updateTurns: (turns: number) => void;

        load_SummaryTriggerThreshold: () => Promise<number | null>;
        updateSummaryTriggerThreshold: (value: number) => void;

        load_RecentKeepTurns: () => Promise<number | null>;
        updateRecentKeepTurns: (value: number) => void;
      };
    };
  }
}
export {};