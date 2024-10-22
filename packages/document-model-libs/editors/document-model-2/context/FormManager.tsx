import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AddTypeForm } from "../components/form/add-type-form";
import { ModelMetadataForm } from "../components/form/model-metadata-form";
import { ModuleForm } from "../components/form/module-form";
import { OperationForm } from "../components/form/operation-form";
import { useDocumentModel } from "./DocumentModelContext";

export const forms = {
  module: ModuleForm,
  operation: OperationForm,
  type: AddTypeForm,
  metadata: ModelMetadataForm,
} as const;
export type Forms = typeof forms;

export type FormType = keyof Forms;

export type FormPropsMapping = {
  [K in FormType]: React.ComponentProps<Forms[K]>;
};

type FormPropsMap<T> = {
  [K in keyof T]: Omit<T[K], "handlers">;
};

type FormProps = FormPropsMap<FormPropsMapping>;

type FormName = keyof typeof forms;
type TFormManagerContext = {
  activeForm: FormName | undefined;
  showForm: <TFormName extends FormName>(
    formName: TFormName,
    props?: FormProps[TFormName],
  ) => void;
  closeForm: () => void;
};

export const FormManagerContext = createContext<TFormManagerContext>({
  activeForm: undefined,
  showForm: () => {},
  closeForm: () => {},
});

export const useFormManager = () => useContext(FormManagerContext);

export function FormManager(props: { children: ReactNode }) {
  const { children } = props;
  const { handlers } = useDocumentModel();
  const [formProps, setFormProps] = useState<FormProps[keyof FormProps]>();
  const [activeForm, setActiveForm] = useState<FormName>();

  const showForm: TFormManagerContext["showForm"] = useCallback(
    (formName, props) => {
      setActiveForm(formName);
      setFormProps(props);
    },
    [],
  );

  const closeForm = useCallback(() => {
    setActiveForm(undefined);
  }, []);

  const FormComponent = activeForm ? forms[activeForm] : null;

  const value = useMemo(
    () => ({
      activeForm,
      showForm,
      closeForm,
    }),
    [activeForm, showForm, closeForm],
  );

  return (
    <FormManagerContext.Provider value={value}>
      {children}
      {FormComponent ? (
        <FormComponent {...(formProps as any)} handlers={handlers} />
      ) : null}
    </FormManagerContext.Provider>
  );
}
