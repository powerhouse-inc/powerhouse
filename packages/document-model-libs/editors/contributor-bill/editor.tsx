import React, { useEffect, useState } from "react";
import { EditorProps } from "document-model/document";
import {
  ContributorBillState,
  ContributorBillAction,
  ContributorBillLocalState,
  actions,
} from "../../document-models/contributor-bill";
import {
  RWAButton,
  Modal,
  Button,
  FormInput,
} from "@powerhousedao/design-system";
import { utils as documentModelUtils } from "document-model/document";

export type IProps = EditorProps<
  ContributorBillState,
  ContributorBillAction,
  ContributorBillLocalState
>;

interface LineItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string, currency: string, amount: number) => void;
}

const DateTimeLocalInput: React.FC<React.HTMLProps<HTMLInputElement>> = (
  props,
) => (
  <input
    className="h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0"
    step={1}
    type="date"
    {...props}
  />
);

const LineItemModal: React.FC<LineItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("");

  const handleSave = () => {
    setDescription("");
    setCurrency("");
    setAmount("");
    setType("");
    onSave(description, currency, Number(amount));
    onClose();
  };

  return (
    <Modal open={isOpen}>
      <div style={{ padding: "20px", width: "350px", borderRadius: "10px" }}>
        <h2
          style={{
            fontWeight: "bold",
            fontSize: "1.5em",
            marginBottom: "10px",
          }}
        >
          Add Line Item
        </h2>
        <div>
          <label>Description:</label>
          <FormInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label>Currency:</label>
          <FormInput
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label>Amount:</label>
          <FormInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose} style={{ marginRight: "10px" }}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};

interface PowtLineItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string, projectCode: string, amount: number) => void;
}

const PowtLineItemModal: React.FC<PowtLineItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [description, setDescription] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [amount, setAmount] = useState("");

  const handleSave = () => {
    setDescription("");
    setProjectCode("");
    setAmount("");
    onSave(description, projectCode, Number(amount));
    onClose();
  };

  return (
    <Modal open={isOpen}>
      <div style={{ padding: "20px", width: "350px", borderRadius: "10px" }}>
        <h2
          style={{
            fontWeight: "bold",
            fontSize: "1.5em",
            marginBottom: "10px",
          }}
        >
          Add POWt Line Item
        </h2>
        <div>
          <label>Description:</label>
          <FormInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label>Project Code:</label>
          <FormInput
            value={projectCode}
            onChange={(e) => setProjectCode(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label>Amount:</label>
          <FormInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose} style={{ marginRight: "10px" }}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};

export default function Editor(props: IProps) {
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [issuer, setIssuer] = useState("");
  const [recipient, setRecipient] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    if (issueDate && dueDate && issuer && recipient) {
      updateContributorBill();
    }
  }, [issueDate, dueDate, issuer, recipient]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPowtModalOpen, setIsPowtModalOpen] = useState(false);

  const { document, dispatch, context } = props;
  const {
    state: { global: state },
  } = document;

  const handleAddLineItem = (type: "stablecoin" | "powt") => {
    if (type === "stablecoin") {
      setIsModalOpen(true);
    } else if (type === "powt") {
      setIsPowtModalOpen(true);
    }
  };

  const handleSaveLineItem = (
    description: string,
    currency: string,
    amount: number,
  ) => {
    dispatch(
      actions.addStablecoinLineItem({
        id: documentModelUtils.hashKey(),
        description,
        currency,
        amount,
      }),
    );
  };

  const handleSavePowtLineItem = (
    description: string,
    projectCode: string,
    amount: number,
  ) => {
    dispatch(
      actions.addPowtLineItem({
        id: documentModelUtils.hashKey(),
        description,
        amount,
        projectCode,
      }),
    );
  };

  const updateContributorBill = () => {
    dispatch(
      actions.updateContributorBill({
        issued: issueDate,
        due: dueDate,
        issuer: issuer,
        recipient: recipient,
      }),
    );
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontWeight: "bold", fontSize: "2em" }}>Contributor Bill</h1>
      <div>
        <label>Issue Date:</label>
        <DateTimeLocalInput
          defaultValue={state.issued}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setIssueDate(e.target.value)
          }
          style={{ marginTop: "10px", marginLeft: "10px", width: "250px" }}
        />
      </div>
      <div>
        <label>Due Date:</label>
        <DateTimeLocalInput
          defaultValue={state.due || ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDueDate(e.target.value)
          }
          style={{ marginTop: "10px", marginLeft: "10px", width: "250px" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "20px",
        }}
      >
        <div>
          <h3>Issuer (Contributor)</h3>
          <FormInput
            defaultValue={state.issuer || ""}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="@Powerhouse-Ops-Hub"
            style={{ width: "200px" }}
          />
        </div>
        <div>
          <h3>Recipient (Bill to)</h3>
          <FormInput
            defaultValue={state.recipient || ""}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="@Powerhouse-Ops-Hub"
            style={{ width: "200px" }}
          />
        </div>
      </div>
      <h3 style={{ marginTop: "20px", fontWeight: "bold", fontSize: "1.5em" }}>
        Complete Bill Line Items
      </h3>
      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h4 style={{ fontWeight: "bold", fontSize: "1.2em" }}>
            Stable Coin / Cash Component
          </h4>
          <RWAButton
            style={{ marginBottom: "10px" }}
            onClick={() => handleAddLineItem("stablecoin")}
          >
            Add Stablecoin Line Item
          </RWAButton>
        </div>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "20px",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0" }}>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Description
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Currency
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {state.stableComp.map((item) => (
              <tr key={item.id} style={{ backgroundColor: "#fff" }}>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.description}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.currency}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ textAlign: "right", fontWeight: "bold" }}>
          Total {state.stableComp.reduce((acc, item) => acc + item.amount, 0)}
        </p>
      </div>
      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h4 style={{ fontWeight: "bold", fontSize: "1.2em" }}>
            Proof of work Token
          </h4>
          <RWAButton
            style={{ marginBottom: "10px" }}
            onClick={() => handleAddLineItem("powt")}
          >
            Add POWt Line Item
          </RWAButton>
        </div>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "20px",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0" }}>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Description
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Project Code
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {state.powtComp.map((item, index) => (
              <tr key={index} style={{ backgroundColor: "#fff" }}>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.description}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.projectCode}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ textAlign: "right", fontWeight: "bold" }}>
          Total {state.powtComp.reduce((acc, item) => acc + item.amount, 0)}
        </p>
      </div>
      <h3 style={{ marginTop: "20px", fontWeight: "bold", fontSize: "1.2em" }}>
        Summary
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>
              Description
            </th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>
              Currency
            </th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr key={`stablecoin`} style={{ backgroundColor: "#fff" }}>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              Stable Coin / Cash Component
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              stablecoin
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              {state.stableComp.reduce((acc, item) => acc + item.amount, 0)}
            </td>
          </tr>
          <tr key={`powt`} style={{ backgroundColor: "#fff" }}>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              Proof of Work Token
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>POWT</td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              {state.powtComp.reduce((acc, item) => acc + item.amount, 0)}
            </td>
          </tr>
        </tbody>
      </table>

      <LineItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(description: string, currency: string, amount: number) =>
          handleSaveLineItem(description, currency, amount)
        }
      />

      <PowtLineItemModal
        isOpen={isPowtModalOpen}
        onClose={() => setIsPowtModalOpen(false)}
        onSave={(description: string, projectCode: string, amount: number) =>
          handleSavePowtLineItem(description, projectCode, amount)
        }
      />
      <pre style={{ marginTop: "40px" }}>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
