/**
 * @name RevengeDiscordStickers
 * @version 1.0.0
 * @description Replaces ezgif picker with Discord's sticker picker
 * @author Claude
 */

import { Plugin } from "@revenge-mod/plugin";
import { findByProps, findByStoreName } from "@revenge-mod/metro";
import { after, before } from "@revenge-mod/patcher";
import { React } from "@revenge-mod/metro/common";
import { getAssetIDByName } from "@revenge-mod/ui/assets";
import { findInReactTree } from "@revenge-mod/utils";
import { showToast } from "@revenge-mod/ui/toasts";

interface Sticker {
  id: string;
  name: string;
  format_type: number;
  description: string;
  asset?: string;
  tags?: string[];
  available?: boolean;
  guild_id?: string;
  type?: number;
}

interface StickerStore {
  getStickerById: (id: string) => Sticker;
  getAllStickers: () => Sticker[];
  getStickersByGuildId: (guildId: string) => Sticker[];
}

interface StickerUtils {
  fetchStickers: () => Promise<Sticker[]>;
  favoriteSticker: (stickerId: string) => void;
}

interface StickerPermissionUtils {
  canUseSticker: (sticker: Sticker) => boolean;
  isStickerPremiumLocked: (sticker: Sticker) => boolean;
}

interface MessageActions {
  sendSticker: (channelId: string, stickerId: string, messageContent?: object) => void;
  sendMessage: (channelId: string, message: object) => void;
}

interface StickerPickerComponents {
  StickerPicker: {
    default: React.ComponentType<any>;
  };
  openStickerPicker?: (channelId: string) => void;
}

export default class RevengeDiscordStickers extends Plugin {
  private patches: Array<() => void> = [];
  private stickerCache: Record<string, Sticker> = {};
  
  private StickerStore: StickerStore;
  private MessageActions: MessageActions;
  private StickerUtils: StickerUtils;
  private StickerPermissionUtils: StickerPermissionUtils;
  private StickerPickerComponents: StickerPickerComponents;

  start() {
    console.log("[RevengeDiscordStickers] Loading...");
    
    // Initialize stores and components
    this.StickerStore = findByStoreName("StickersStore") || findByProps("getStickerById");
    this.MessageActions = findByProps("sendMessage", "sendStickers");
    this.StickerUtils = findByProps("fetchStickers", "favoriteSticker");
    this.StickerPermissionUtils = findByProps("canUseSticker", "isStickerPremiumLocked");
    this.StickerPickerComponents = findByProps("StickerPicker");
    
    // Patch Discord's sticker picker to allow all stickers
    this.patchStickerPicker();
    
    // Patch sticker sending function
    this.patchStickerSending();
    
    // Replace ezgif picker with Discord's sticker picker
    this.replaceEzgifPicker();
    
    // Fetch stickers
    this.fetchAllStickers();
    
    showToast("RevengeDiscordStickers enabled");
    console.log("[RevengeDiscordStickers] Successfully loaded");
  }

  stop() {
    console.log("[RevengeDiscordStickers] Unloading...");
    for (const unpatch of this.patches) {
      unpatch();
    }
    this.patches = [];
    showToast("RevengeDiscordStickers disabled");
    console.log("[RevengeDiscordStickers] Successfully unloaded");
  }

  private patchStickerPicker(): void {
    if (!this.StickerPickerComponents?.StickerPicker) {
      console.error("[RevengeDiscordStickers] Could not find StickerPicker component");
      return;
    }

    this.patches.push(
      after("default", this.StickerPickerComponents.StickerPicker, (args: any, res: any) => {
        const stickerItems = findInReactTree(res, (n: any) => n && n.stickers);
        
        if (stickerItems) {
          // Add all available stickers regardless of permissions
          const allStickers = this.StickerStore.getAllStickers();
          stickerItems.stickers = allStickers;
        }
        
        // Remove premium restrictions
        const premiumRequired = findInReactTree(res, (n: any) => n && n.premiumRequired);
        if (premiumRequired) {
          premiumRequired.premiumRequired = false;
        }
        
        return res;
      })
    );
  }

  private patchStickerSending(): void {
    // Override permission checks
    if (this.StickerPermissionUtils) {
      this.patches.push(
        after("canUseSticker", this.StickerPermissionUtils, () => true)
      );
      
      this.patches.push(
        after("isStickerPremiumLocked", this.StickerPermissionUtils, () => false)
      );
    }
    
    // Patch the message sending function
    if (this.MessageActions) {
      this.patches.push(
        before("sendSticker", this.MessageActions, ([channelId, stickerId, messageContent]: [string, string, object]) => {
          console.log(`[RevengeDiscordStickers] Sending sticker ${stickerId} to channel ${channelId}`);
          return [channelId, stickerId, messageContent];
        })
      );
    }
  }

  private replaceEzgifPicker(): void {
    // Find the chat input component
    const ChatInput = findByProps("ChatInput")?.ChatInput;
    if (!ChatInput) {
      console.error("[RevengeDiscordStickers] Could not find ChatInput component");
      return;
    }
    
    // Find the ezgif button or GIF button
    this.patches.push(
      after("default", ChatInput, (args: any, res: any) => {
        const buttons = findInReactTree(res, (n: any) => n && n.type && n.type.name === "ChatInputButtons");
        
        if (buttons) {
          const gifButton = findInReactTree(buttons, (n: any) => n && n.type?.name === "GIFButton");
          
          if (gifButton) {
            // Replace GIF button with sticker button
            const originalOnClick = gifButton.props.onPress;
            
            gifButton.props.onPress = () => {
              // Open Discord's sticker pic
