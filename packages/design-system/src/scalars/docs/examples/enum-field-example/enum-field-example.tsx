import { Button } from "#powerhouse";
import { Form } from "@/scalars/components";
import { EnumField } from "@/scalars/components";

const EnumFieldExample = () => {
  const onSubmit = async (data: any) => {
    // simulate a network request
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alert(JSON.stringify(data, null, 2));
  };

  const genderOptions = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Other", value: "other" },
  ];

  const colorOptions = [
    { label: "Red", value: "red" },
    { label: "Blue", value: "blue" },
    { label: "Green", value: "green" },
    { label: "Yellow", value: "yellow" },
    { label: "Purple", value: "purple" },
    { label: "Orange", value: "orange" },
  ];

  return (
    <Form onSubmit={onSubmit}>
      {({ formState: { isSubmitting } }) => (
        <div className="flex w-[400px] flex-col gap-4">
          <EnumField
            name="gender"
            label="Gender"
            variant="RadioGroup"
            options={genderOptions}
            required
          />

          <EnumField
            name="favoriteColor"
            label="Favorite Color"
            description="Choose your favorite color"
            variant="Select"
            options={colorOptions}
            searchable
            placeholder="Select a color"
            required
          />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      )}
    </Form>
  );
};

export default EnumFieldExample;
