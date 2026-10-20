"""Static-only unfamiliar compositions; these sources are never executed."""
import torch
from torch import nn


class ReusedCircuit(nn.Module):
    def weave(self, x):
        value = torch.sin(x)
        return torch.tanh(value) - torch.cos(value)

    def forward(self, x):
        return torch.relu(self.weave(x))


class SquaredCircuit(nn.Module):
    def weave(self, x):
        value = torch.sin(x)
        return value * value

    def forward(self, x):
        return torch.relu(self.weave(x))


class TupleCircuit(nn.Module):
    def split(self, x):
        return torch.sin(x), torch.cos(x)

    def weave(self, x):
        left, right = self.split(x)
        return torch.tanh(left * right)

    def forward(self, x):
        return torch.relu(self.weave(x))


class UnknownCircuit(nn.Module):
    def weave(self, x):
        value = foreign_unresolved(x)
        return torch.tanh(value) - torch.cos(value)

    def good(self, x):
        value = torch.sin(x)
        return value * value

    def forward(self, x):
        return self.weave(x) + self.good(x)


class ConditionalCircuit(nn.Module):
    def weave(self, x, choose):
        value = torch.sin(x)
        if choose:
            return value * value
        return torch.cos(value)

    def forward(self, x, choose):
        return torch.relu(self.weave(x, choose))
