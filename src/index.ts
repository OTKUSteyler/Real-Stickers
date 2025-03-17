import { logger, registerCommand } from "@vendetta";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { findInReactTree } from "@vendetta/utils";
import { ApplicationCommandType, ApplicationCommandOptionType } from "@vendetta/types";
import Settings from "./components/Settings";

// Interfaces
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

let patches = [];
let stickerCache: Record<string, Sticker> = {};

// Store and component references
const StickerStore = findByStoreName("StickersStore") || findByProps("getStickerById", "getAllStickers");
const MessageActions = findByProps("sendMessage", "sendStickers");
const StickerUtils = findByProps("fetchStickers", "favoriteSticker");
const StickerPermissionUtils = findByProps("canUseSticker", "isStickerPremiumLocked");
const StickerPickerComponents = findByProps("StickerPicker");

const pluginName = "RevengeDiscordStickers";

export default {
  settings: Settings,
  onLoad: () => {
    logger.log(`[${pluginName}] Loading...`);
    
    // Patch Discord's sticker picker to allow all stickers
    patchStickerPicker();
    
    // Patch sticker sending function
    patchStickerSending();
    
    // Replace ezgif picker with Discord's sticker picker
    replaceEzgifPicker();
    
    // Fetch stickers for caching
    fetchAllStickers();
    
    // Register command to toggle sticker UI
    registerStickerCommand();
    
    showToast(`${pluginName} enabled`);
    logger.log(`[${pluginName}] Successfully loaded`);
  },
  onUnload: () => {
    logger.log(`[${pluginName}] Unloading...`);
    
    // Unpatch everything
    for (const unpatch of patches) {
      unpatch();
    }
    
    // Clear cache
    stickerCache = {};
    
    showToast(`${pluginName} disabled`);
    logger.log(`[${pluginName}] Successfully unloaded`);
  }
};

function patchStickerPicker() {
  if (!StickerPickerComponents?.StickerPicker) {
    logger.error(`[${pluginName}] Could not find StickerPicker component`);
    return;
  }

  patches.push(
    after("default", StickerPickerComponents.StickerPicker, (args, res) => {
      const stickerItems = findInReactTree(res, n => n && n.stickers);
      
      if (stickerItems) {
        // Add all available stickers regardless of permissions
        const allStickers = StickerStore.getAllStickers();
        stickerItems.stickers = allStickers;
      }
      
      // Remove premium restrictions
      const premiumRequired = findInReactTree(res, n => n && n.premiumRequired);
      if (premiumRequired) {
        premiumRequired.premiumRequired = false;
      }
      
      return res;
    })
  );
}

function patchStickerSending() {
  // Override permission checks
  if (StickerPermissionUtils) {
    patches.push(
      after("canUseSticker", StickerPermissionUtils, () => true)
    );
    
    patches.push(
      after("isStickerPremiumLocked", StickerPermissionUtils, () => false)
    );
  }
  
  // Patch the message sending function
  if (MessageActions) {
    patches.push(
      before("sendSticker", MessageActions, ([channelId, stickerId, messageContent]) => {
        logger.log(`[${pluginName}] Sending sticker ${stickerId} to channel ${channelId}`);
        return [channelId, stickerId, messageContent];
      })
    );
  }
}

function replaceEzgifPicker() {
  // Find the chat input component
  const ChatInput = findByProps("ChatInput")?.ChatInput;
  if (!ChatInput) {
    logger.error(`[${pluginName}] Could not find ChatInput component`);
    return;
  }
  
  // Find the ezgif button or GIF button
  patches.push(
    after("default", ChatInput, (args, res) => {
      const buttons = findInReactTree(res, n => n && n.type && n.type.name === "ChatInputButtons");
      
      if (buttons) {
        const gifButton = findInReactTree(buttons, n => n && n.type?.name === "GIFButton");
        
        if (gifButton) {
          // Replace GIF button with sticker button
          const originalOnPress = gifButton.props.onPress;
          
          gifButton.props.onPress = () => {
            // Open Discord's sticker picker instead
            const stickerId = getAssetIDByName("sticker");
            gifButton.props.icon = stickerId;
            
            // Use Discord's sticker picker open function
            if (StickerPickerComponents?.openStickerPicker) {
              StickerPickerComponents.openStickerPicker(args[0].channelId);
            } else {
              // Fallback
              originalOnPress();
            }
          };
          
          // Change icon to sticker icon
          gifButton.props.icon = getAssetIDByName("sticker") || gifButton.props.icon;
        }
      }
      
      return res;
    })
  );
}

function fetchAllStickers() {
  if (StickerUtils?.fetchStickers) {
    StickerUtils.fetchStickers().then(stickers => {
      logger.log(`[${pluginName}] Fetched ${stickers.length} stickers`);
      
      // Cache stickers for quick access
      stickers.forEach(sticker => {
        stickerCache[sticker.id] = sticker;
      });
    }).catch(err => {
      logger.error(`[${pluginName}] Error fetching stickers:`, err);
    });
  }
}

function registerStickerCommand() {
  registerCommand({
    name: "stickers",
    displayName: "stickers",
    description: "Open Discord sticker picker",
    displayDescription: "Open Discord sticker picker",
    type: ApplicationCommandType.CHAT,
    options: [
      {
        name: "action",
        displayName: "action",
        description: "Action to perform",
        displayDescription: "Action to perform",
        type: ApplicationCommandOptionType.STRING,
        choices: [
          {
            name: "open",
            displayName: "open",
            value: "open"
          },
          {
            name: "refresh",
            displayName: "refresh",
            value: "refresh"
          }
        ],
        required: true
      }
    ],
    execute: (args, ctx) => {
      const action = args[0].value;
      
      if (action === "open") {
        // Open sticker picker
        if (StickerPickerComponents?.openStickerPicker) {
          StickerPickerComponents.openStickerPicker(ctx.channel.id);
          return {
            content: "Opening sticker picker..."
          };
        }
      } else if (action === "refresh") {
        // Refresh sticker cache
        fetchAllStickers();
        return {
          content: "Refreshing sticker cache..."
        };
      }
      
      return {
        content: "Failed to perform action"
      };
    }
  });
}
