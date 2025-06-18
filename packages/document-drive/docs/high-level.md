flowchart TD
    Client([Client Application]) --> GraphQL
    GraphQL --> Client
    
    subgraph Server[ ]
        Storage[(Storage)]
        Queue[Queue]
        ProcessOps[Process Operations]
        Listeners[Listeners]
        Sync[Synchronization]
        
        %% Internal flows
        Queue --> ProcessOps
        ProcessOps --> Storage
        ProcessOps --> Listeners
        Listeners --> Sync
        Sync <--> Storage
    end
    
    %% Main data flows
    GraphQL --> Queue
    Listeners --> GraphQL
    
    RemoteServer([Remote Document Drive]) <-->|Pull/Push| Listeners
    