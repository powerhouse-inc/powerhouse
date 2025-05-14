import { Button } from "#powerhouse";
import { BooleanField } from "../../boolean-field/index.js";
import { Form } from "../../form/index.js";
import { RadioGroupField } from "../../fragments/radio-group-field/index.js";
import { NumberField } from "../../number-field/index.js";
import { StringField } from "../../string-field/index.js";

const MultipleFieldsWithComplexLayout = () => {
  const onSubmit = async (data: any) => {
    // simulate a slow network request
    await new Promise((resolve) => setTimeout(resolve, 2000));
    alert(JSON.stringify(data, null, 2));
  };

  return (
    <Form
      onSubmit={onSubmit}
      defaultValues={{
        name: "",
        email: "",
        bio: "",
        phone: "",
        age: 0,
        notifications: true,
        gender: "",
        subscribe: true,
        termsAndConditions: false,
      }}
    >
      {({ formState: { isSubmitting } }) => (
        <div className="flex w-[700px] flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <StringField
              name="name"
              label="First Name"
              placeholder="John"
              required
              maxLength={50}
            />
            <NumberField
              name="age"
              label="Age"
              placeholder="25"
              required
              precision={0}
              showErrorOnBlur
            />
            <NumberField
              showErrorOnBlur
              name="height"
              label="Height (cm)"
              placeholder="180"
              required
              precision={2}
              trailingZeros
            />
            <StringField
              name="email"
              label="Email"
              placeholder="john@doe.com"
              required
              pattern={/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i}
            />

            <StringField
              name="phone"
              label="Phone"
              placeholder="(123) 456-7890"
              pattern={/^\(\d{3}\)\s\d{3}-\d{4}$/}
              description="Enter your phone number. Format: (000) 000-0000"
            />
          </div>

          <StringField
            name="bio"
            label="Bio (length: 20-100 characters, pattern: letters, numbers and spaces)"
            placeholder="I am a software engineer..."
            minLength={20}
            maxLength={100}
            multiline
            pattern={/^[a-zA-Z0-9 ]+$/}
            required
            showErrorOnChange
          />

          <RadioGroupField
            name="gender"
            label="Gender"
            options={[
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
              { label: "Other", value: "other" },
            ]}
            required
          />

          <BooleanField
            name="notifications"
            label="Receive notifications"
            description="Receive notifications about your account activity"
            isToggle
          />

          <div className="flex flex-col gap-1">
            <BooleanField name="subscribe" label="Subscribe to newsletter" />
            <BooleanField
              name="termsAndConditions"
              label={
                <div>
                  Accept{" "}
                  <a href="#" className="font-bold text-blue-500">
                    terms and conditions
                  </a>
                </div>
              }
              required
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      )}
    </Form>
  );
};

export default MultipleFieldsWithComplexLayout;
