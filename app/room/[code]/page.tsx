import GameRoom from "@/components/GameRoom";

export default async function RoomPage(props: PageProps<"/room/[code]">) {
  const { code } = await props.params;
  return (
    <div className="flex flex-1 flex-col px-3 py-4 sm:px-6">
      <GameRoom code={code.toUpperCase()} />
    </div>
  );
}
