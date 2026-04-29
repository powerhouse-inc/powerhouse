export function CreateTestDocument() {
  async function createDocument() {}
  return (
    <>
      <section>
        <button
          onClick={() => {
            createDocument().catch(console.error);
          }}
        >
          create doc
        </button>
      </section>
    </>
  );
}
