import json
from dataclasses import asdict, is_dataclass
from typing import Any, Type, TypeVar

T = TypeVar("T")


class JsonHelper:

    def serialize(obj: Any, indent: int = None) -> str:
        """Serialize an object to a JSON string."""
        return json.dumps(JsonHelper._to_dict(obj), indent=indent)

    def deserialize(json_str: str, cls: Type[T] = None) -> Any:
        """Deserialize a JSON string. If cls is provided, map to that class."""
        data = json.loads(json_str)
        if cls is not None:
            return JsonHelper._from_dict(data, cls)
        return data

    def serialize_to_file(obj: Any, filepath: str, indent: int = 2) -> None:
        """Serialize an object and write it to a file."""
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(JsonHelper._to_dict(obj), f, indent=indent)

    def deserialize_from_file(filepath: str, cls: Type[T] = None) -> Any:
        """Read a JSON file and deserialize it. If cls is provided, map to that class."""
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        if cls is not None:
            return JsonHelper._from_dict(data, cls)
        return data

    def _to_dict(obj: Any) -> Any:
        if is_dataclass(obj) and not isinstance(obj, type):
            return asdict(obj)
        if hasattr(obj, "__dict__"):
            return {k: JsonHelper._to_dict(v) for k, v in vars(obj).items()}
        if isinstance(obj, (list, tuple)):
            return [JsonHelper._to_dict(item) for item in obj]
        if isinstance(obj, dict):
            return {k: JsonHelper._to_dict(v) for k, v in obj.items()}
        return obj

    def _from_dict(data: Any, cls: Type[T]) -> T:
        if not isinstance(data, dict):
            return data
        import inspect
        params = inspect.signature(cls.__init__).parameters
        kwargs = {
            k: data[k]
            for k in params
            if k != "self" and k in data
        }
        return cls(**kwargs)
