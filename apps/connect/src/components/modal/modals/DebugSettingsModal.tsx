import { connectConfig } from "@powerhousedao/connect/config";
import { serviceWorkerManager } from "@powerhousedao/connect/utils";
import { Icon, Modal, PowerhouseButton } from "@powerhousedao/design-system";
import { Combobox, FormInput } from "@powerhousedao/design-system/connect";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";

export const DebugSettingsModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "debugSettings";

  const [appVersion, setAppVersion] = useState(connectConfig.appVersion);
  const [serviceWorkerDebugMode, setServiceWorkerDebugMode] = useState({
    label: serviceWorkerManager.debug ? "Enabled" : "Disabled",
    value: serviceWorkerManager.debug,
  });

  useEffect(() => {
    serviceWorkerManager.setDebug(serviceWorkerDebugMode.value);
  }, [serviceWorkerDebugMode]);

  return (
    <Modal
      open={open}
      onOpenChange={(status) => {
        if (!status) return closePHModal();
      }}
      contentProps={{
        className: "rounded-2xl",
      }}
    >
      <div className="w-[700px] rounded-2xl p-6">
        <div className="mb-6 flex justify-between">
          <div className="text-xl font-bold">Debug Tools</div>
          <button id="close-modal" onClick={() => closePHModal()}>
            <Icon name="Xmark" size={28} />
          </button>
        </div>
        <div className="flex text-sm font-bold">
          <Icon name="Ring" size={22} />
          <span className="ml-2">App Version: {connectConfig.appVersion}</span>
        </div>
        <div className="mt-4 flex text-sm font-bold">
          <Icon name="Hdd" size={22} />
          <span className="ml-2">Drive Tools:</span>
        </div>

        <div className="mt-4 flex text-sm font-bold">
          <Icon name="Gear" size={22} />
          <span className="ml-2">Service Worker Tools:</span>
        </div>
        <div className="mt-2 flex items-end justify-between pl-4">
          <div className="w-[400px]">
            <label htmlFor="serviceWorkerDebugMode" className="text-xs">
              Service Worker Debug Mode:
            </label>
            <Combobox
              id="serviceWorkerDebugMode"
              onChange={(value) => {
                setServiceWorkerDebugMode(
                  value as typeof serviceWorkerDebugMode,
                );
              }}
              value={serviceWorkerDebugMode}
              options={[
                { label: "Enabled", value: true },
                { label: "Disabled", value: false },
              ]}
            />
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between pl-4">
          <div className="w-[400px]">
            <label htmlFor="appVersion" className="text-xs">
              Set invalid app version:
            </label>
            <FormInput
              containerClassName="p-1 bg-white border border-gray-200 rounded-md text-sm"
              inputClassName="text-xs font-normal"
              id="appVersion"
              icon={
                <div className="flex h-full items-center text-xs">Version:</div>
              }
              value={appVersion}
              onChange={(element) => setAppVersion(element.target.value)}
            />
          </div>
          <div className="mb-1 flex items-center justify-center">
            <PowerhouseButton
              color={appVersion === "" ? "light" : "red"}
              size="small"
              disabled={appVersion === ""}
              onClick={() => {
                // @ts-expect-error todo add send message method to service worker manager class
                serviceWorkerManager.sendMessage({
                  type: "SET_APP_VERSION",
                  version: appVersion,
                });
                setAppVersion("");
              }}
            >
              Add Invalid App Version
            </PowerhouseButton>
          </div>
        </div>
      </div>
    </Modal>
  );
};
