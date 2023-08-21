"use client";

import NextLink from "next/link";
import { Link } from "@nextui-org/link";
import { Snippet } from "@nextui-org/snippet";
import { Code } from "@nextui-org/code";
import { button as buttonStyles } from "@nextui-org/theme";
import { siteConfig } from "@/config/site";
import { title, subtitle } from "@/components/primitives";
import { GithubIcon } from "@/components/icons";
import CollectionOps from "@/components/CollectionOps";
import RecordsExplorer from "@/components/RecordsExplorer";
import PromptEditor from "@/components/PromptEditor";
import RecordOps from "@/components/RecordOps";
import { Dispatch, SetStateAction, createContext, useEffect, useState } from "react";
import { DataRecord, Collection } from "@/types";
import { Notify } from "notiflix";

export const SelectedRecordContext = createContext<{
  currentRecord: DataRecord | null;
  setCurrentRecord: Dispatch<SetStateAction<DataRecord | null>> | null;
}>({ currentRecord: null, setCurrentRecord: null });

export const CollectionContext = createContext<{
  currentCollection: Collection | null;
  setCurrentCollection: Dispatch<SetStateAction<Collection | null>> | null;
}>({ currentCollection: null, setCurrentCollection: null });

export const NeedUpdateContext = createContext<{
  needUpdate: boolean;
  setNeedUpdate: Dispatch<SetStateAction<boolean>>;
}>({ needUpdate: false, setNeedUpdate: () => {} });

export interface GlobalState {
  currentCollection: Collection | null;
  currentRecord: DataRecord | null;
  newRecord: DataRecord | null;
  deleteRecord: DataRecord | null;
}

export const GlobalContext = createContext<{
  globalState: GlobalState;
  setGlobalState: Dispatch<SetStateAction<GlobalState>>;
}>({
  globalState: {
    currentCollection: null,
    currentRecord: null,
    newRecord: null,
    deleteRecord: null
  },
  setGlobalState: () => {},
});

export default function Home() {
  const [currentRecord, setCurrentRecord] = useState<DataRecord | null>(null);
  const [currentCollection, setCurrentCollection] = useState<Collection | null>(
    null
  );
  const [needUpdate, setNeedUpdate] = useState<boolean>(false);
  const needUpdateState = { needUpdate, setNeedUpdate };
  const [globalState, setGlobalState] = useState<GlobalState>({
    currentCollection: null,
    currentRecord: null,
    newRecord: null,
    deleteRecord: null,
  });

  useEffect(() => {
    Notify.init({ position: "center-top" });
  }, []);

  return (
    <section className="flex flex-col gap-4 md:py-4">
      <GlobalContext.Provider value={{ globalState, setGlobalState }}>
        <NeedUpdateContext.Provider value={needUpdateState}>
          <SelectedRecordContext.Provider
            value={{ currentRecord, setCurrentRecord }}
          >
            <CollectionContext.Provider
              value={{ currentCollection, setCurrentCollection }}
            >
              <CollectionOps />

              <div className="grid grid-cols-4">
                <RecordsExplorer />

                <div className="col-span-2">
                  <PromptEditor />
                </div>

                <RecordOps />
              </div>
            </CollectionContext.Provider>
          </SelectedRecordContext.Provider>
        </NeedUpdateContext.Provider>
      </GlobalContext.Provider>
    </section>
  );
}
