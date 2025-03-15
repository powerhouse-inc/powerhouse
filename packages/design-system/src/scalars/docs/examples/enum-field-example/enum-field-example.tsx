import { Button } from "#powerhouse";
import { BooleanField, Checkbox, Form, Toggle } from "#scalars";
import { useState } from "react";

const EnumFieldExample = () => {
  const onSubmit = async (data: any) => {
    // simulate a network request
    alert(JSON.stringify(data, null, 2));
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    alert(JSON.stringify({
      isAdmin,
      isActive,
    }, null, 2));
  };


  return (
    <div className="flex gap-4">
      <Form onSubmit={onSubmit} className="bg-gray-100 rounded-md">
        {({ formState: { isSubmitting } }) => (
          <div className="flex w-[400px] flex-col gap-4 p-2">
            <BooleanField name="isAdmin" label="Is Admin" />
            <BooleanField name="isActive" label="Is Active" isToggle />

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        )}
      </Form>
      <div className="flex flex-col gap-4 w-full">
        <div className="bg-gray-100 rounded-md p-2">
          <form onSubmit={handleSubmit} className="flex w-[400px] flex-col gap-4">
            <Checkbox name="isAdmin" label="Is Admin" value={isAdmin} onChange={() => setIsAdmin(!isAdmin)} />
            <Toggle name="isActive" label="Is Active" value={isActive} onChange={() => setIsActive(!isActive)} />

            <Button type="submit">
              Submit
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EnumFieldExample;
