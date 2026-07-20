from feast import Entity, ValueType

driver_entity = Entity(
    name="driver_id",
    value_type=ValueType.STRING,
    description="Unique fleet driver identifier",
)

vehicle_entity = Entity(
    name="vehicle_id",
    value_type=ValueType.STRING,
    description="Unique fleet vehicle asset identifier",
)

trip_entity = Entity(
    name="trip_id",
    value_type=ValueType.STRING,
    description="Unique trip log identifier",
)
