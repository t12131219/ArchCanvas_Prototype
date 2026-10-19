"""Local source contracts for dynamic reads, resources, exits and returns."""
import torch
from torch import Tensor, nn


class ShapeUnit(nn.Module):
    def forward(self, x: Tensor):
        b, t, d = x.shape
        return x.view(b, t, d).to(dtype=torch.float32, device=x.device)


class RenamedShape(nn.Module):
    def forward(self, other: Tensor):
        first, second, third = other.shape
        return other.view(first, second, third).to(dtype=torch.float32, device=other.device)


class ResourceUnit(nn.Module):
    def __init__(self, probability=0.1):
        super().__init__()
        self.resource = nn.Dropout(probability)

    def apply(self, value: Tensor, operation):
        return operation(value)

    def forward(self, x: Tensor):
        return self.apply(x, self.resource)


class ExitUnit(nn.Module):
    def forward(self, x: Tensor):
        if x.dim() != 3:
            raise ValueError('rank must equal 3')
        b, t, d = x.shape
        return x.view(b, t, d)


class ReturnUnit(nn.Module):
    def part(self, x: Tensor, detailed=False):
        if detailed:
            return x, x
        return x

    def forward(self, x: Tensor):
        return self.part(x)


class ConditionalTensor(nn.Module):
    def forward(self, x: Tensor):
        if x.dim() > 1:
            current = x + 1
        else:
            current = x - 1
        return current.to(device=current.device)


class PartialTensor(nn.Module):
    def forward(self, x: Tensor, keep=True):
        current = x if keep else None
        return current.device


class CustomAttribute(nn.Module):
    def forward(self, x: Tensor):
        return x.custom_property


class UnknownBeforeRead(nn.Module):
    def forward(self, x: Tensor):
        mystery(x)
        return x.shape


class MutableBeforeRead(nn.Module):
    def forward(self, x: Tensor):
        x.add_(1)
        return x.shape


class ShadowedNamespace(nn.Module):
    def forward(self, torch):
        return torch.float32


class Stack(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([ConditionalTensor(), ConditionalTensor()])
    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x
