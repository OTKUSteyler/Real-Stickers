import { ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";

const { FormSection, FormRow, FormSwitch } = Forms;
const { View } = ReactNative;

// Initialize default settings if they don't exist
storage.settings ??= {
  replaceGifButton: true,
  showToasts: true,
  logDebug: false
};

export default () => {
  useProxy(storage);

  return (
    <View style={{ flex: 1 }}>
      <FormSection title="APPEARANCE">
        <FormRow
          label="Replace GIF button"
          subLabel="Replace the GIF button with sticker button"
          leading={<FormRow.Icon source={getAssetIDByName("ic_sticker")} />}
          trailing={
            <FormSwitch
              value={storage.settings.replaceGifButton}
              onValueChange={(value) => {
                storage.settings.replaceGifButton = value;
              }}
            />
          }
        />
      </FormSection>

      <FormSection title="BEHAVIOR">
        <FormRow
          label="Show toasts"
          subLabel="Show toast notifications for plugin actions"
          leading={<FormRow.Icon source={getAssetIDByName("ic_message_info")} />}
          trailing={
            <FormSwitch
              value={storage.settings.showToasts}
              onValueChange={(value) => {
                storage.settings.showToasts = value;
              }}
            />
          }
        />

        <FormRow
          label="Debug logs"
          subLabel="Enable detailed debug logging"
          leading={<FormRow.Icon source={getAssetIDByName("debug")} />}
          trailing={
            <FormSwitch
              value={storage.settings.logDebug}
              onValueChange={(value) => {
                storage.settings.logDebug = value;
              }}
            />
          }
        />
      </FormSection>
    </View>
  );
};
