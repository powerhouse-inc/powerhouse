/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { utils as documentModelUtils } from "document-model/document";

import utils from "../../gen/utils";
import {
  z,
  CreateContributorBillInput,
  AddStablecoinLineItemInput,
  AddPowtLineItemInput,
  UpdateStablecoinLineItemInput,
  UpdatePowtLineItemInput,
  DeleteStablecoinLineItemInput,
  DeletePowtLineItemInput,
  UpdateContributorBillInput,
} from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/contributor-bill/creators";
import { ContributorBillDocument } from "../../gen/types";

describe("ContributorBill Operations", () => {
  let document: ContributorBillDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle createContributorBill operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: CreateContributorBillInput = generateMock(
      z.CreateContributorBillInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.createContributorBill(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "CREATE_CONTRIBUTOR_BILL",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle addStablecoinLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: AddStablecoinLineItemInput = generateMock(
      z.AddStablecoinLineItemInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.addStablecoinLineItem(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "ADD_STABLECOIN_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle addPowtLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: AddPowtLineItemInput = generateMock(
      z.AddPowtLineItemInputSchema(),
    );

    const updatedDocument = reducer(document, creators.addPowtLineItem(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "ADD_POWT_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle updateStablecoinLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: UpdateStablecoinLineItemInput = generateMock(
      z.UpdateStablecoinLineItemInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.updateStablecoinLineItem(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "UPDATE_STABLECOIN_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle updatePowtLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: UpdatePowtLineItemInput = generateMock(
      z.UpdatePowtLineItemInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.updatePowtLineItem(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "UPDATE_POWT_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle deleteStablecoinLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: DeleteStablecoinLineItemInput = generateMock(
      z.DeleteStablecoinLineItemInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.deleteStablecoinLineItem(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "DELETE_STABLECOIN_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle deletePowtLineItem operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: DeletePowtLineItemInput = generateMock(
      z.DeletePowtLineItemInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.deletePowtLineItem(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "DELETE_POWT_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle updateContributorBill operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: UpdateContributorBillInput = generateMock(
      z.UpdateContributorBillInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.updateContributorBill(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "UPDATE_CONTRIBUTOR_BILL",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
